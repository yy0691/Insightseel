/**
 * Deepgram Speech-to-Text Service
 * Professional speech recognition with generous free tier ($200 credits)
 */

import { getEffectiveSettings } from './dbService';

// System default Deepgram API key (from environment variable)
// Users can override this in settings
const SYSTEM_DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY;

interface DeepgramResponse {
  metadata: {
    transaction_key: string;
    request_id: string;
    sha256: string;
    created: string;
    duration: number;
    channels: number;
  };
  results: {
    channels: Array<{
      alternatives: Array<{
        transcript: string;
        confidence: number;
        words: Array<{
          word: string;
          start: number;
          end: number;
          confidence: number;
        }>;
      }>;
    }>;
  };
}

interface DeepgramSegment {
  start: number;
  end: number;
  text: string;
}

/**
 * Get the Deepgram API key to use
 * Priority: User's key > System default key
 */
function getDeepgramApiKey(userKey?: string): string | undefined {
  return userKey || SYSTEM_DEEPGRAM_KEY;
}

/**
 * Check if Deepgram API is available and configured
 * Also tests the API key by making a simple validation request
 */
export async function isDeepgramAvailable(): Promise<boolean> {
  const settings = await getEffectiveSettings();
  const apiKey = getDeepgramApiKey(settings.deepgramApiKey);
  
  if (!apiKey) {
    console.log('[Deepgram] ❌ API Key not configured:', {
      hasUserKey: !!settings.deepgramApiKey,
      hasSystemKey: !!SYSTEM_DEEPGRAM_KEY,
    });
    return false;
  }

  console.log('[Deepgram] 🔍 Checking API Key availability:', {
    hasUserKey: !!settings.deepgramApiKey,
    hasSystemKey: !!SYSTEM_DEEPGRAM_KEY,
    usingKey: settings.deepgramApiKey ? 'user' : 'system',
    keyLength: apiKey.length,
    keyPrefix: apiKey.substring(0, 8) + '...'
  });

  // 🎯 优先尝试直接调用Deepgram API（绕过Vercel）
  try {
    console.log('[Deepgram] 🔄 Trying direct API call (bypassing Vercel)...');
    const testResponse = await fetch('https://api.deepgram.com/v1/projects', {
      method: 'GET',
      headers: {
        'Authorization': `Token ${apiKey}`,
      },
    });

    if (testResponse.ok) {
      console.log('[Deepgram] ✅ Direct API call successful! Will use direct mode (no Vercel proxy)');
      return true;
    } else {
      console.warn('[Deepgram] ⚠️ Direct API call failed, falling back to proxy mode');
    }
  } catch (directError) {
    console.log('[Deepgram] ℹ️ Direct API call not available (CORS or network), will try proxy mode');
  }

  // 备选：通过Vercel proxy验证（旧方案）
  try {
    const testResponse = await fetch('/api/deepgram-proxy', {
      method: 'GET',
      headers: {
        'X-Deepgram-API-Key': apiKey,
      },
    });

    if (testResponse.ok) {
      const result = await testResponse.json();
      if (result.valid) {
        console.log('[Deepgram] ✅ API Key is valid (via proxy)');
        return true;
      } else {
        console.warn('[Deepgram] ⚠️ API Key validation failed:', result);
        return false;
      }
    } else {
      const errorData = await testResponse.json().catch(() => ({ error: 'Unknown error' }));
      console.warn('[Deepgram] ⚠️ API Key validation failed:', {
        status: testResponse.status,
        statusText: testResponse.statusText,
        error: errorData.error || errorData
      });
      return false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[Deepgram] ⚠️ Failed to validate API Key (network error, but key exists):', {
      error: errorMessage
    });
    // If network error but key exists, assume it might work (could be temporary network issue)
    // Return true to allow attempt, but log the warning
    return true;
  }
}

/**
 * Generate subtitles using Deepgram API
 * Uses Nova-2 model for best accuracy/cost balance
 */
export async function generateSubtitlesWithDeepgram(
  file: File | Blob,
  language?: string,
  onProgress?: (progress: number) => void
): Promise<DeepgramResponse> {
  const settings = await getEffectiveSettings();
  const apiKey = getDeepgramApiKey(settings.deepgramApiKey);

  if (!apiKey) {
    throw new Error('Deepgram API key not configured. Please add VITE_DEEPGRAM_API_KEY to environment variables or configure in settings.');
  }

  const fileSizeMB = file.size / (1024 * 1024);
  const VERCEL_SIZE_LIMIT_MB = 4; // Vercel has 4.5MB limit, use 4MB for safety
  const DEEPGRAM_DIRECT_LIMIT_MB = 2000; // Deepgram API supports up to 2GB for direct calls

  console.log('[Deepgram] Transcribing with Nova-2 model...', {
    fileSize: `${fileSizeMB.toFixed(2)}MB`,
    fileType: file.type,
    language,
    willNeedCompression: fileSizeMB > VERCEL_SIZE_LIMIT_MB,
    canUseDirectMode: fileSizeMB <= DEEPGRAM_DIRECT_LIMIT_MB
  });

  // 🎯 策略：
  // 1. 如果文件 <= 4MB：先尝试直接调用，失败则通过proxy
  // 2. 如果文件 4MB-2GB：尝试直接调用（绕过Vercel限制）
  // 3. 如果文件 > 2GB：必须压缩
  
  // 🎯 检查是否应该尝试直接调用
  // 注意：Deepgram API 的某些端点（如 /v1/projects）不支持CORS
  // 如果在验证阶段检测到CORS错误，这里也会遇到相同问题
  const shouldTryDirectFirst = fileSizeMB <= DEEPGRAM_DIRECT_LIMIT_MB;
  
  // 🎯 对于大文件，先尝试直接调用（如果不是太大）
  // 注意：如果遇到CORS错误，会自动降级到压缩+proxy模式
  let directCallFailed = false;
  if (shouldTryDirectFirst && fileSizeMB > VERCEL_SIZE_LIMIT_MB && fileSizeMB <= 500) {
    console.log(`[Deepgram] 🚀 Large file (${fileSizeMB.toFixed(2)}MB), will try direct API call first (bypassing Vercel)`);
    console.log('[Deepgram] ⚠️ Warning: Large files may take longer or timeout. If this fails, will compress and retry.');
    
    // 先尝试直接调用，不压缩
    try {
      onProgress?.(10);
      
      const params = new URLSearchParams({
        model: 'nova-2',
        smart_format: 'true',
        punctuate: 'true',
        paragraphs: 'false',
        utterances: 'false',
      });

      if (language && language !== 'auto') {
        params.append('language', language);
      }

      const contentType = file.type || 'video/mp4';
      const directUrl = `https://api.deepgram.com/v1/listen?${params.toString()}`;
      
      console.log('[Deepgram] 📤 Uploading to Deepgram directly (no compression needed)...');
      
      const directResponse = await fetch(directUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': contentType,
        },
        body: file,
      });

      onProgress?.(90);

      if (directResponse.ok) {
        const result: DeepgramResponse = await directResponse.json();
        onProgress?.(100);
        console.log('[Deepgram] ✅ Direct API call successful! No compression needed!');
        return result;
      } else {
        const errorText = await directResponse.text();
        console.warn('[Deepgram] ⚠️ Direct API call failed (will compress and retry):', errorText);
        directCallFailed = true;
      }
    } catch (directError) {
      const errorMsg = directError instanceof Error ? directError.message : String(directError);
      console.log('[Deepgram] ℹ️ Direct API call failed (will compress and retry):', errorMsg);
      directCallFailed = true;
    }
  }

  // For large files that need compression or if direct call failed
  if (fileSizeMB > VERCEL_SIZE_LIMIT_MB || directCallFailed) {
    if (fileSizeMB > 100) {
      console.log(`[Deepgram] 🔥 Very large file (${fileSizeMB.toFixed(2)}MB), skipping direct call`);
      console.log('[Deepgram] 🎯 Will compress first for optimal performance...');
    } else if (directCallFailed) {
      console.log(`[Deepgram] ⚠️ Direct call failed or timed out, trying compression approach...`);
    } else {
      console.log(`[Deepgram] File too large for proxy (${fileSizeMB.toFixed(2)}MB > ${VERCEL_SIZE_LIMIT_MB}MB)`);
      console.log('[Deepgram] Compressing audio to reduce size...');
    }
    
    try {
      // Import audio extraction service
      const { extractAndCompressAudio, isAudioExtractionSupported } = await import('./audioExtractionService');
      
      // Check if audio extraction is supported
      if (!isAudioExtractionSupported()) {
        throw new Error('Audio extraction not supported in this browser. Please use Chrome, Edge, or Firefox.');
      }

      onProgress?.(5);
      
      // 🎯 智能压缩策略：根据文件大小选择合适的比特率和时长
      // 对于超大文件，使用更激进的压缩
      let targetBitrate = 32000; // 默认 32 kbps
      let maxDuration: number | undefined = undefined;
      
      if (fileSizeMB > 300) {
        // 超超大文件（>300MB）：使用 8kbps + 限制时长为10分钟
        targetBitrate = 8000;
        maxDuration = 10 * 60; // 10 minutes
        console.log('[Deepgram] 🔧 Using ultra-aggressive compression: 8kbps, max 10 minutes');
      } else if (fileSizeMB > 200) {
        // 超大文件（>200MB）：使用 8kbps + 限制时长为15分钟
        targetBitrate = 8000;
        maxDuration = 15 * 60; // 15 minutes
        console.log('[Deepgram] 🔧 Using aggressive compression: 8kbps, max 15 minutes');
      } else if (fileSizeMB > 100) {
        // 大文件（>100MB）：使用 12kbps + 限制时长为20分钟
        targetBitrate = 12000;
        maxDuration = 20 * 60; // 20 minutes
        console.log('[Deepgram] 🔧 Using medium compression: 12kbps, max 20 minutes');
      } else if (fileSizeMB > 50) {
        // 中等文件（>50MB）：使用 16kbps + 限制时长为25分钟
        targetBitrate = 16000;
        maxDuration = 25 * 60; // 25 minutes
        console.log('[Deepgram] 🔧 Using light compression: 16kbps, max 25 minutes');
      }
      
      // Extract and compress audio
      const { audioBlob, originalSize, compressedSize, compressionRatio, duration } = await extractAndCompressAudio(
        file,
        {
          onProgress: (progress, stage) => {
            // Map extraction progress (0-100%) to 5-50% of total progress
            onProgress?.(5 + progress * 0.45);
            console.log(`[Deepgram] ${stage} (${progress.toFixed(0)}%)`);
          },
          targetBitrate,
          maxDurationSeconds: maxDuration,
        }
      );

      onProgress?.(50);
      
      const compressedSizeMB = compressedSize / (1024 * 1024);
      console.log('[Deepgram] Audio compressed successfully:', {
        originalSize: `${fileSizeMB.toFixed(2)}MB`,
        compressedSize: `${compressedSizeMB.toFixed(2)}MB`,
        compressionRatio: `${compressionRatio.toFixed(1)}x`,
        savedSpace: `${((1 - compressedSize / originalSize) * 100).toFixed(1)}%`,
        processedDuration: maxDuration ? `${(maxDuration / 60).toFixed(1)} minutes` : `${(duration / 60).toFixed(1)} minutes (full)`,
      });

      // Check if compressed audio is still too large
      if (compressedSizeMB > VERCEL_SIZE_LIMIT_MB) {
        console.warn(`[Deepgram] Compressed audio still too large (${compressedSizeMB.toFixed(2)}MB > ${VERCEL_SIZE_LIMIT_MB}MB)`);
        console.log('[Deepgram] Attempting to upload to storage (requires Supabase configuration)...');
        
        // Try storage upload as fallback
        try {
          const { uploadFileToStorageWithProgress } = await import('../utils/uploadToStorage');
          
          // Convert Blob to File
          const fileToUpload = new File([audioBlob], 'compressed-audio.wav', { type: 'audio/wav' });
          
          const uploadResult = await uploadFileToStorageWithProgress(fileToUpload, {
            onProgress: (uploadProgress) => {
              onProgress?.(50 + uploadProgress * 0.3);
            },
          });

          onProgress?.(80);
          console.log('[Deepgram] Audio uploaded, using URL mode:', uploadResult.fileUrl);

          // Use Deepgram URL mode
          const params = new URLSearchParams({
            model: 'nova-2',
            smart_format: 'true',
            punctuate: 'true',
            paragraphs: 'false',
            utterances: 'false',
          });

          if (language && language !== 'auto') {
            params.append('language', language);
          }

          params.append('url_mode', 'true');
          const proxyUrl = `/api/deepgram-proxy?${params.toString()}`;

          const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
              'X-Deepgram-API-Key': apiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: uploadResult.fileUrl }),
          });

          onProgress?.(90);

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Deepgram API error (${response.status}): ${errorText || response.statusText}`);
          }

          const result: DeepgramResponse = await response.json();
          onProgress?.(100);

          console.log('[Deepgram] Transcription complete (URL mode with compressed audio)');
          return result;
        } catch (uploadError) {
          const uploadErrorMessage = uploadError instanceof Error ? uploadError.message : String(uploadError);
          console.error('[Deepgram] Storage upload failed:', uploadErrorMessage);
          
          // 📌 重要提示：提供更友好的错误信息
          const isSupabaseConfigError = uploadErrorMessage.includes('SUPABASE_SERVICE_ROLE_KEY') 
            || uploadErrorMessage.includes('not configured')
            || uploadErrorMessage.includes('500');
          
          if (isSupabaseConfigError) {
            throw new Error(
              `⚠️ 需要配置 Supabase Storage 以处理大文件\n\n` +
              `当前情况：\n` +
              `• 原始文件：${fileSizeMB.toFixed(2)}MB\n` +
              `• 压缩后：${compressedSizeMB.toFixed(2)}MB（${maxDuration ? `前${maxDuration/60}分钟` : '全部'}）\n` +
              `• 压缩比率：${compressionRatio.toFixed(1)}x\n` +
              `• Vercel限制：${VERCEL_SIZE_LIMIT_MB}MB\n\n` +
              `🔧 解决方案（3选1）：\n\n` +
              `【推荐】方案1：配置 Supabase Storage\n` +
              `  在 Vercel 环境变量中添加：\n` +
              `  • SUPABASE_SERVICE_ROLE_KEY=你的密钥\n` +
              `  详见：https://github.com/你的项目/docs/SUPABASE_STORAGE_SETUP.md\n\n` +
              `方案2：使用更短的视频\n` +
              `  当前已处理${maxDuration ? `前${maxDuration/60}分钟` : '全部内容'}，\n` +
              `  可以尝试剪辑为10-15分钟的片段\n\n` +
              `方案3：本地处理\n` +
              `  下载视频到本地，使用本地工具处理\n\n` +
              `💡 临时绕过方法：\n` +
              `  系统已自动使用8kbps超低比特率压缩，\n` +
              `  如果仍然失败，请尝试更短的视频片段。\n\n` +
              `⚠️ Supabase Storage configuration required for large files\n\n` +
              `Current status:\n` +
              `• Original file: ${fileSizeMB.toFixed(2)}MB\n` +
              `• Compressed: ${compressedSizeMB.toFixed(2)}MB (${maxDuration ? `first ${maxDuration/60} min` : 'full'})\n` +
              `• Compression ratio: ${compressionRatio.toFixed(1)}x\n` +
              `• Vercel limit: ${VERCEL_SIZE_LIMIT_MB}MB\n\n` +
              `🔧 Solutions (choose one):\n\n` +
              `[Recommended] Option 1: Configure Supabase Storage\n` +
              `  Add to Vercel environment variables:\n` +
              `  • SUPABASE_SERVICE_ROLE_KEY=your-key\n` +
              `  See: https://github.com/your-project/docs/SUPABASE_STORAGE_SETUP.md\n\n` +
              `Option 2: Use shorter videos\n` +
              `  Currently processed ${maxDuration ? `first ${maxDuration/60} min` : 'full content'},\n` +
              `  try 10-15 minute segments\n\n` +
              `Option 3: Process locally\n` +
              `  Download video and use local tools\n`
            );
          }
          
          // 其他错误
          throw new Error(
            `压缩后的音频仍然太大 (${compressedSizeMB.toFixed(2)}MB)\n\n` +
            '尝试上传到存储服务失败：\n' +
            uploadErrorMessage + '\n\n' +
            '建议解决方案：\n' +
            '1. 配置 Supabase Storage（设置 SUPABASE_SERVICE_ROLE_KEY）\n' +
            '2. 使用时长更短的视频片段\n' +
            '3. 联系技术支持\n\n' +
            `Compressed audio still too large (${compressedSizeMB.toFixed(2)}MB)\n\n` +
            'Failed to upload to storage:\n' +
            uploadErrorMessage + '\n\n' +
            'Suggested solutions:\n' +
            '1. Configure Supabase Storage (set SUPABASE_SERVICE_ROLE_KEY)\n' +
            '2. Use a shorter video segment\n' +
            '3. Contact technical support'
          );
        }
      }

      // Use compressed audio
      console.log('[Deepgram] ✅ Compression successful! Using compressed audio for transcription');
      file = audioBlob;
      
      // 🎯 压缩后的音频优先尝试直接调用（绕过Vercel和Storage）
      const compressedFileSizeMB = file.size / (1024 * 1024);
      console.log(`[Deepgram] 📊 Compressed audio size: ${compressedFileSizeMB.toFixed(2)}MB`);
      
      if (compressedFileSizeMB <= DEEPGRAM_DIRECT_LIMIT_MB) {
        console.log(`[Deepgram] 🚀 Compressed audio (${compressedFileSizeMB.toFixed(2)}MB) is small enough for direct API call`);
        console.log('[Deepgram] 🎯 Attempting direct call (bypassing Vercel & Storage)...');
        
        try {
          onProgress?.(55);
          
          const params = new URLSearchParams({
            model: 'nova-2',
            smart_format: 'true',
            punctuate: 'true',
            paragraphs: 'false',
            utterances: 'false',
          });

          if (language && language !== 'auto') {
            params.append('language', language);
          }

          const contentType = 'audio/wav';
          const directUrl = `https://api.deepgram.com/v1/listen?${params.toString()}`;
          
          console.log('[Deepgram] 📤 Uploading compressed audio directly to Deepgram...');
          
          const directResponse = await fetch(directUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Token ${apiKey}`,
              'Content-Type': contentType,
            },
            body: file,
          });

          onProgress?.(90);

          if (directResponse.ok) {
            const result: DeepgramResponse = await directResponse.json();
            onProgress?.(100);
            console.log('[Deepgram] ✅✅✅ SUCCESS! Direct API call with compressed audio worked!');
            console.log('[Deepgram] 🎉 No Vercel proxy, no Storage, no login required!');
            return result;
          } else {
            const errorText = await directResponse.text();
            console.warn('[Deepgram] ⚠️ Direct API call with compressed audio failed:', errorText);
            console.log('[Deepgram] Will try proxy mode as fallback...');
          }
        } catch (compressedDirectError) {
          const errorMsg = compressedDirectError instanceof Error ? compressedDirectError.message : String(compressedDirectError);
          console.log('[Deepgram] ℹ️ Direct API call with compressed audio failed:', errorMsg);
          console.log('[Deepgram] Will try proxy mode as fallback...');
        }
      } else {
        console.log(`[Deepgram] ⚠️ Compressed audio (${compressedFileSizeMB.toFixed(2)}MB) still too large for direct call`);
        console.log('[Deepgram] Will try uploading to Storage or use proxy...');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Deepgram] Audio compression failed:', errorMessage);
      
      // If compression failed, throw descriptive error
      if (errorMessage.includes('not supported')) {
        throw new Error(
          '音频压缩不支持\n\n' +
          '您的浏览器不支持音频提取功能。\n\n' +
          '解决方案：\n' +
          '1. 使用 Chrome、Edge 或 Firefox 浏览器\n' +
          '2. 配置 Supabase Storage 以处理大文件\n' +
          '3. 使用更小的视频文件（< 4MB）\n\n' +
          'Audio compression not supported\n\n' +
          'Your browser does not support audio extraction.\n\n' +
          'Solutions:\n' +
          '1. Use Chrome, Edge, or Firefox browser\n' +
          '2. Configure Supabase Storage for large files\n' +
          '3. Use a smaller video file (< 4MB)'
        );
      }
      
      throw error;
    }
  }

  // For small files (≤ 4MB), use direct upload
  onProgress?.(10);

  // Build API URL with parameters
  const params = new URLSearchParams({
    model: 'nova-2',
    smart_format: 'true',
    punctuate: 'true',
    paragraphs: 'false',
    utterances: 'false',
  });

  // Add language if specified
  if (language && language !== 'auto') {
    params.append('language', language);
  }

  // Determine content type - Deepgram accepts video files directly
  const contentType = file.type || 'audio/wav';

  // 🎯 方案1：尝试直接调用Deepgram API（绕过Vercel，无大小限制）
  try {
    console.log('[Deepgram] 🚀 Attempting direct API call (bypassing Vercel)...', {
      fileSize: `${fileSizeMB.toFixed(2)}MB`,
      contentType,
      willBypassVercelLimit: true
    });

    const directUrl = `https://api.deepgram.com/v1/listen?${params.toString()}`;
    const directResponse = await fetch(directUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': contentType,
      },
      body: file,
    });

    onProgress?.(90);

    if (directResponse.ok) {
      const result: DeepgramResponse = await directResponse.json();
      onProgress?.(100);
      console.log('[Deepgram] ✅ Direct API call successful! (bypassed Vercel)');
      return result;
    } else {
      const errorText = await directResponse.text();
      console.warn('[Deepgram] ⚠️ Direct API call failed:', {
        status: directResponse.status,
        error: errorText
      });
      throw new Error(`Direct call failed: ${errorText}`);
    }
  } catch (directError) {
    const directErrorMsg = directError instanceof Error ? directError.message : String(directError);
    console.log('[Deepgram] ℹ️ Direct API call not available, falling back to proxy mode:', directErrorMsg);
  }

  // 🔄 方案2：降级到Vercel proxy模式（有4MB限制）
  console.log('[Deepgram] 🔄 Using proxy mode (Vercel)');
  
  // Build proxy URL with query parameters
  const proxyUrl = `/api/deepgram-proxy?${params.toString()}`;

  console.log('[Deepgram] Sending request through proxy:', {
    url: proxyUrl,
    contentType,
    hasAuth: !!apiKey,
    keySource: settings.deepgramApiKey ? 'user' : 'system'
  });

  // Call Deepgram API through proxy
  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'X-Deepgram-API-Key': apiKey,
      'Content-Type': contentType,
    },
    body: file,
  });

  onProgress?.(90);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Deepgram] API error:', {
      status: response.status,
      statusText: response.statusText,
      errorBody: errorText,
      headers: Object.fromEntries(response.headers.entries())
    });
    throw new Error(`Deepgram API error (${response.status}): ${errorText || response.statusText}`);
  }

  const result: DeepgramResponse = await response.json();
  onProgress?.(100);

  console.log('[Deepgram] Transcription complete (proxy mode)');

  return result;
}

/**
 * Convert Deepgram response to segments
 * Groups words into ~5-second segments for better readability
 */
export function deepgramToSegments(response: DeepgramResponse): DeepgramSegment[] {
  if (!response.results.channels || response.results.channels.length === 0) {
    return [];
  }

  const words = response.results.channels[0].alternatives[0].words;
  if (!words || words.length === 0) {
    return [];
  }

  const segments: DeepgramSegment[] = [];
  const MAX_SEGMENT_DURATION = 5.0; // 5 seconds per segment
  const MAX_WORDS_PER_SEGMENT = 15; // Max words per segment

  let currentSegment: DeepgramSegment = {
    start: words[0].start,
    end: words[0].end,
    text: words[0].word,
  };

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const segmentDuration = word.end - currentSegment.start;
    const wordCount = currentSegment.text.split(' ').length;

    // Start new segment if duration or word count exceeds limit
    if (segmentDuration > MAX_SEGMENT_DURATION || wordCount >= MAX_WORDS_PER_SEGMENT) {
      segments.push(currentSegment);
      currentSegment = {
        start: word.start,
        end: word.end,
        text: word.word,
      };
    } else {
      // Add word to current segment
      currentSegment.text += ' ' + word.word;
      currentSegment.end = word.end;
    }
  }

  // Add last segment
  if (currentSegment.text) {
    segments.push(currentSegment);
  }

  return segments;
}

/**
 * Convert Deepgram response to SRT format
 */
export function deepgramToSrt(response: DeepgramResponse): string {
  const segments = deepgramToSegments(response);

  if (segments.length === 0) {
    const transcript = response.results.channels[0]?.alternatives[0]?.transcript || '';
    return `1\n00:00:00,000 --> 00:00:10,000\n${transcript}\n`;
  }

  return segments.map((segment, index) => {
    const startTime = formatTimestamp(segment.start);
    const endTime = formatTimestamp(segment.end);
    const text = segment.text.trim();

    return `${index + 1}\n${startTime} --> ${endTime}\n${text}\n`;
  }).join('\n');
}

/**
 * Format seconds to SRT timestamp (HH:MM:SS,mmm)
 */
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}
