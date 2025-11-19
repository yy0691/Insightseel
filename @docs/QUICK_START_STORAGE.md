# 对象存储直传快速设置指南

## 🚀 5 分钟快速设置

### 步骤 1：创建存储桶（2 分钟）

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **Storage** → 点击 **New bucket**
4. 配置：
   - **Name**: `video-uploads`
   - **Public**: `false`（推荐）
   - **File size limit**: `500MB`
5. 点击 **Create bucket**

### 步骤 2：配置 RLS 策略（1 分钟）

在 Supabase SQL Editor 中执行：

```sql
-- 复制并执行 supabase/migrations/create_video_uploads_storage.sql 的内容
-- 或者直接执行以下 SQL：

CREATE POLICY IF NOT EXISTS "Allow authenticated uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'video-uploads' AND (storage.foldername(name))[1] = 'videos');

CREATE POLICY IF NOT EXISTS "Allow authenticated reads"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'video-uploads');

CREATE POLICY IF NOT EXISTS "Allow authenticated deletes"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'video-uploads');

CREATE POLICY IF NOT EXISTS "Allow service role full access"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'video-uploads')
WITH CHECK (bucket_id = 'video-uploads');
```

### 步骤 3：配置环境变量（1 分钟）

在 Vercel Dashboard 中添加：

```
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**获取 Service Role Key**：
1. Supabase Dashboard → Settings → API
2. 复制 **service_role** key（⚠️ 保密，不要暴露给客户端）

### 步骤 4：验证设置（1 分钟）

运行测试：

```typescript
import { uploadFileToStorageWithProgress } from './utils/uploadToStorage';

const testFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
const result = await uploadFileToStorageWithProgress(testFile);
console.log('✅ Upload successful:', result.fileUrl);
```

## 📋 完整设置步骤

详细说明请查看：[`SUPABASE_STORAGE_SETUP.md`](./SUPABASE_STORAGE_SETUP.md)

## 🎯 工作原理

### 自动处理流程

```
视频分析请求
    ↓
检查文件大小
    ↓
< 4MB? → 直接发送 base64
    ↓
≥ 4MB? → 上传到对象存储 → 使用 URL
```

### 代码自动处理

系统会自动：
1. 提取音频
2. 检查大小
3. 如果 > 4MB，自动上传到对象存储
4. 使用 URL 进行分析
5. 如果上传失败，降级到视频帧

**无需修改现有代码**，系统会自动选择最佳方案！

## ✅ 验证清单

- [ ] 存储桶 `video-uploads` 已创建
- [ ] RLS 策略已配置
- [ ] `SUPABASE_SERVICE_ROLE_KEY` 已配置
- [ ] 测试上传成功

## 🐛 常见问题

### 上传失败：权限不足
- 检查用户是否已登录
- 检查 RLS 策略是否正确
- 检查存储桶是否存在

### 上传失败：文件过大
- 检查存储桶的文件大小限制
- 检查 Supabase 项目限制

### 无法读取文件
- 检查文件路径是否正确
- 检查 RLS 策略是否允许读取

## 📚 相关文档

- [完整设置指南](./SUPABASE_STORAGE_SETUP.md)
- [对象存储架构说明](./OBJECT_STORAGE_UPLOAD.md)（如果存在）
- [Vercel 环境变量配置](./VERCEL_ENV_SETUP.md)








