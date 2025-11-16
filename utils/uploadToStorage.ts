/**
 * Upload file directly to object storage (Supabase Storage)
 * This avoids sending large files through Vercel serverless functions
 */

export interface UploadResult {
  fileUrl: string;
  filePath: string;
  expiresAt?: string;
}

export interface UploadOptions {
  onProgress?: (progress: number) => void;
  maxRetries?: number;
}

/**
 * Get upload path from backend
 */
async function getUploadPath(
  fileName: string,
  fileType: string,
  fileSize?: number
): Promise<{ filePath: string; bucket: string; expiresAt?: string }> {
  const response = await fetch('/api/get-upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName,
      fileType,
      fileSize,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Failed to get upload path: ${error.error || response.statusText}`);
  }

  return await response.json();
}

/**
 * Upload file directly to Supabase Storage
 */
export async function uploadFileToStorage(
  file: File,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const { onProgress, maxRetries = 3 } = options;

  try {
    // Step 1: Get upload path from backend
    onProgress?.(0);
    const { filePath, bucket, expiresAt } = await getUploadPath(
      file.name,
      file.type,
      file.size
    );

    onProgress?.(10);

    // Step 2: Upload using Supabase client
    const { supabase } = await import('../services/authService');
    
    if (!supabase) {
      throw new Error('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    }

    // Check if user is authenticated (required for storage uploads)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('User not authenticated. Please log in to upload files.');
    }

    // Check if bucket exists and is accessible
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
      console.error('[Upload] Error listing buckets:', bucketError);
      throw new Error(`Failed to access storage: ${bucketError.message}. Please check Supabase configuration.`);
    }
    
    const bucketExists = buckets?.some(b => b.id === bucket);
    if (!bucketExists) {
      throw new Error(`Storage bucket "${bucket}" does not exist. Please create it in Supabase Dashboard > Storage.`);
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      // Provide more detailed error information
      let errorMessage = `Upload failed: ${error.message}`;
      if (error.message.includes('fetch')) {
        errorMessage += '\n\nPossible causes:\n' +
          '1. Network connection issue\n' +
          '2. Supabase URL incorrect (check VITE_SUPABASE_URL)\n' +
          '3. CORS configuration issue\n' +
          '4. Storage bucket not accessible';
      } else if (error.message.includes('permission') || error.message.includes('policy')) {
        errorMessage += '\n\nPossible causes:\n' +
          '1. RLS policies not configured (run SQL migration)\n' +
          '2. User not authenticated\n' +
          '3. Insufficient permissions';
      }
      throw new Error(errorMessage);
    }

    onProgress?.(100);

    // Step 3: Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return {
      fileUrl: urlData.publicUrl,
      filePath: filePath,
      expiresAt,
    };
  } catch (error) {
    if (maxRetries > 0 && error instanceof Error && error.message.includes('Upload failed')) {
      console.warn(`Upload failed, retrying... (${maxRetries} retries left)`);
      return uploadFileToStorage(file, { ...options, maxRetries: maxRetries - 1 });
    }
    throw error;
  }
}

/**
 * Upload file with progress tracking
 * Note: Supabase Storage doesn't support XHR progress for uploads
 * We'll simulate progress based on upload stages
 */
export async function uploadFileToStorageWithProgress(
  file: File,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const { onProgress, maxRetries = 3 } = options;

  try {
    // Step 1: Get upload path
    onProgress?.(0);
    const { filePath, bucket, expiresAt } = await getUploadPath(
      file.name,
      file.type,
      file.size
    );

    onProgress?.(10);

    // Step 2: Upload using Supabase client
    const { supabase } = await import('../services/authService');
    
    if (!supabase) {
      throw new Error('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    }

    // Check if user is authenticated (required for storage uploads)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('User not authenticated. Please log in to upload files.');
    }

    // Check if bucket exists and is accessible
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
      console.error('[Upload] Error listing buckets:', bucketError);
      throw new Error(`Failed to access storage: ${bucketError.message}. Please check Supabase configuration.`);
    }
    
    const bucketExists = buckets?.some(b => b.id === bucket);
    if (!bucketExists) {
      throw new Error(`Storage bucket "${bucket}" does not exist. Please create it in Supabase Dashboard > Storage.`);
    }

    // Simulate progress (Supabase doesn't provide upload progress)
    onProgress?.(30);

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      // Provide more detailed error information
      let errorMessage = `Upload failed: ${error.message}`;
      if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
        errorMessage += '\n\n可能的原因：\n' +
          '1. 网络连接问题\n' +
          '2. Supabase URL 配置错误（检查 VITE_SUPABASE_URL）\n' +
          '3. CORS 配置问题\n' +
          '4. 存储桶不可访问\n\n' +
          'Possible causes:\n' +
          '1. Network connection issue\n' +
          '2. Supabase URL incorrect (check VITE_SUPABASE_URL)\n' +
          '3. CORS configuration issue\n' +
          '4. Storage bucket not accessible';
      } else if (error.message.includes('permission') || error.message.includes('policy')) {
        errorMessage += '\n\n可能的原因：\n' +
          '1. RLS 策略未配置（运行 SQL 迁移文件）\n' +
          '2. 用户未登录\n' +
          '3. 权限不足\n\n' +
          'Possible causes:\n' +
          '1. RLS policies not configured (run SQL migration)\n' +
          '2. User not authenticated\n' +
          '3. Insufficient permissions';
      }
      throw new Error(errorMessage);
    }

    onProgress?.(90);

    // Step 3: Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    onProgress?.(100);

    return {
      fileUrl: urlData.publicUrl,
      filePath: filePath,
      expiresAt,
    };
  } catch (error) {
    if (maxRetries > 0 && error instanceof Error) {
      console.warn(`Upload failed, retrying... (${maxRetries} retries left)`);
      return uploadFileToStorageWithProgress(file, {
        ...options,
        maxRetries: maxRetries - 1,
      });
    }
    throw error;
  }
}

