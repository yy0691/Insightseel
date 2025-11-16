# Supabase Storage 设置指南

## 创建存储桶

### 方法 1：通过 Supabase Dashboard（推荐）

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **Storage** 页面
4. 点击 **New bucket**
5. 配置：
   - **Name**: `video-uploads`
   - **Public bucket**: `false` (推荐，需要认证才能访问)
   - **File size limit**: `500MB` (或根据需求调整)
   - **Allowed MIME types**: 
     - `video/mp4`
     - `video/webm`
     - `video/quicktime`
     - `audio/webm`
     - `audio/mpeg`
6. 点击 **Create bucket**

### 方法 2：通过 SQL（如果支持）

在 Supabase SQL Editor 中执行：

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'video-uploads',
  'video-uploads',
  false,
  524288000, -- 500MB
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'audio/webm', 'audio/mpeg']
)
ON CONFLICT (id) DO NOTHING;
```

## 配置 RLS 策略

### 运行迁移文件

在 Supabase SQL Editor 中执行 `supabase/migrations/create_video_uploads_storage.sql`：

```sql
-- 或者直接复制以下内容执行

-- Policy 1: Allow authenticated users to upload files
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'video-uploads' AND
  (storage.foldername(name))[1] = 'videos'
);

-- Policy 2: Allow authenticated users to read their own files
DROP POLICY IF EXISTS "Allow authenticated reads" ON storage.objects;
CREATE POLICY "Allow authenticated reads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'video-uploads'
);

-- Policy 3: Allow authenticated users to delete their own files
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
CREATE POLICY "Allow authenticated deletes"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'video-uploads'
);

-- Policy 4: Allow service role full access (for server-side operations)
DROP POLICY IF EXISTS "Allow service role full access" ON storage.objects;
CREATE POLICY "Allow service role full access"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'video-uploads')
WITH CHECK (bucket_id = 'video-uploads');
```

### 验证策略

在 SQL Editor 中执行：

```sql
-- 查看所有策略
SELECT * FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage';
```

## 环境变量配置

### Vercel 环境变量

在 Vercel Dashboard 中添加：

```
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**重要**：
- `SUPABASE_SERVICE_ROLE_KEY` 只在服务器端使用
- 不要暴露给客户端
- 在 Supabase Dashboard > Settings > API 中可以找到

### 客户端环境变量（已配置）

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

## 测试上传

### 测试脚本

```typescript
import { uploadFileToStorageWithProgress } from './utils/uploadToStorage';

// 测试上传
const file = new File(['test'], 'test.mp4', { type: 'video/mp4' });

try {
  const result = await uploadFileToStorageWithProgress(file, {
    onProgress: (progress) => {
      console.log(`Upload progress: ${progress}%`);
    },
  });
  
  console.log('Upload successful:', result);
  console.log('File URL:', result.fileUrl);
} catch (error) {
  console.error('Upload failed:', error);
}
```

## 存储限制

### Supabase 免费 tier

- **存储空间**: 1GB
- **带宽**: 10GB/月
- **文件大小**: 50MB/文件（可调整）

### 付费 tier

- 更多存储空间和带宽
- 更大的文件大小限制
- 更好的性能

## 文件清理

### 自动清理策略

考虑实现自动清理机制：

1. **基于时间**：删除超过 7 天的临时文件
2. **基于使用**：处理完成后立即删除
3. **定期清理**：使用 cron job 定期清理

### 清理 SQL

```sql
-- 删除超过 7 天的文件
DELETE FROM storage.objects
WHERE bucket_id = 'video-uploads'
AND created_at < NOW() - INTERVAL '7 days';
```

## 故障排查

### 上传失败：Failed to fetch (api.supabase.com)

**错误信息**：`Failed to fetch` 或 `Error: Failed to fetch (api.supabase.com)`

**可能原因和解决方案**：

1. **Supabase URL 配置错误**
   - 检查 `.env` 文件中的 `VITE_SUPABASE_URL`
   - 确保 URL 格式正确：`https://xxxxx.supabase.co`
   - 在 Vercel 中检查环境变量是否正确设置

2. **用户未登录**
   - 确保用户已通过 `supabase.auth.signIn()` 登录
   - 检查 session 是否存在：`supabase.auth.getSession()`
   - 存储桶设置为私有时，需要认证用户才能上传

3. **存储桶不存在**
   - 在 Supabase Dashboard > Storage 中检查 `video-uploads` 存储桶是否存在
   - 如果不存在，按照"创建存储桶"步骤创建

4. **RLS 策略未配置**
   - 运行 SQL 迁移文件：`supabase/migrations/create_video_uploads_storage.sql`
   - 检查策略是否正确创建：在 SQL Editor 中执行：
     ```sql
     SELECT * FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE '%video-uploads%';
     ```

5. **网络连接问题**
   - 检查网络连接
   - 检查防火墙或代理设置
   - 尝试在浏览器控制台查看详细错误信息

6. **CORS 配置问题**
   - Supabase Storage 通常不需要额外 CORS 配置
   - 如果使用自定义域名，检查 CORS 设置

**诊断步骤**：
```typescript
// 在浏览器控制台执行以下代码进行诊断
import { supabase } from './services/authService';

// 1. 检查 Supabase 配置
console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('Supabase Key:', import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Set' : 'Not set');

// 2. 检查用户登录状态
const { data: { session } } = await supabase.auth.getSession();
console.log('User session:', session ? 'Logged in' : 'Not logged in');

// 3. 检查存储桶
const { data: buckets, error } = await supabase.storage.listBuckets();
console.log('Buckets:', buckets);
console.log('Error:', error);
```

### 上传失败：权限不足

**错误信息**：`Upload failed: new row violates row-level security policy`

**解决方案**：
1. 检查用户是否已登录
2. 检查 RLS 策略是否正确配置
3. 检查存储桶是否存在
4. 检查策略中的 bucket_id 是否匹配

### 上传失败：文件过大

**错误信息**：`Upload failed: file size exceeds limit`

**解决方案**：
1. 检查存储桶的文件大小限制
2. 检查 Supabase 项目限制
3. 考虑压缩文件或分片上传

### 无法读取文件

**错误信息**：`Failed to fetch` 或 `File not found`

**解决方案**：
1. 检查文件路径是否正确
2. 检查 RLS 策略是否允许读取
3. 检查存储桶是否为公开（如果使用 public URL）

### 调试步骤

1. 检查存储桶是否存在：
   ```sql
   SELECT * FROM storage.buckets WHERE id = 'video-uploads';
   ```

2. 检查 RLS 策略：
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'objects';
   ```

3. 检查文件列表：
   ```sql
   SELECT * FROM storage.objects WHERE bucket_id = 'video-uploads';
   ```

## 安全建议

1. **使用认证**：要求用户认证后才能上传
2. **文件类型验证**：限制允许的文件类型
3. **文件大小限制**：设置合理的文件大小限制
4. **定期清理**：删除不再需要的文件
5. **监控使用**：监控存储使用情况，避免超出限制

