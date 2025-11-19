# FFmpeg CDN 配置指南

## 问题描述

在浏览器中看到错误：
```
[FFmpeg] Not available (this is OK - Deepgram will be used instead): FFmpeg CDN sources not configured
```

## 为什么需要配置 FFmpeg CDN？

FFmpeg.wasm 在浏览器中运行需要加载以下核心文件：
1. `ffmpeg-core.js` - JavaScript 核心
2. `ffmpeg-core.wasm` - WebAssembly 二进制文件
3. `ffmpeg-core.worker.js` - Web Worker

这些文件需要从 CDN 加载。如果不配置 CDN，FFmpeg 将无法使用，系统会自动降级到其他字幕生成方法（如 Deepgram/Gemini）。

## 配置方法

### 步骤 1: 创建或编辑 `.env.local` 文件

在项目根目录创建 `.env.local` 文件（如果已存在则编辑它）：

```bash
# 在项目根目录
touch .env.local
```

### 步骤 2: 添加 FFmpeg CDN 配置

**推荐配置（方案 1）：使用 unpkg.com**

```env
VITE_FFMPEG_BASE_URL=https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd
```

**备选方案 2：使用 jsDelivr**

```env
VITE_FFMPEG_BASE_URL=https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd
```

**备选方案 3：使用多个 CDN（推荐）**

配置多个 CDN 源，系统会依次尝试，提高成功率：

```env
VITE_FFMPEG_BASE_URL=https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd,https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd
```

**高级方案 4：使用多线程版本（更快）**

```env
VITE_FFMPEG_BASE_URL=https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm
```

注意：多线程版本需要正确的 COOP/COEP headers，部署时需要额外配置。

### 步骤 3: 重启开发服务器

```bash
npm run dev
```

## 完整的 .env.local 配置示例

```env
# Gemini API Key (必需)
GEMINI_API_KEY=your_gemini_api_key_here

# Deepgram API Key (可选)
VITE_DEEPGRAM_API_KEY=your_deepgram_api_key_here

# FFmpeg CDN 配置（可选 - 用于浏览器视频分割）
VITE_FFMPEG_BASE_URL=https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd,https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd

# FFmpeg 超时设置（可选）
VITE_FFMPEG_LOAD_TIMEOUT_MS=120000
VITE_FFMPEG_DOWNLOAD_TIMEOUT_MS=45000
```

## 验证配置

配置完成后，在浏览器控制台应该看到：

```
[FFmpeg] Starting load with sources: ["https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd"]
[FFmpeg] Attempting load from https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd
[FFmpeg] Load completed successfully from https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd
[FFmpeg] Successfully loaded and ready
```

## 常见问题

### Q1: 不配置 FFmpeg CDN 会怎样？

**A:** 系统会自动降级到其他字幕生成方法：
- 优先使用 **Deepgram**（如果配置了 API Key）
- 或使用 **Gemini** 直接转录
- 不会影响核心功能，只是无法使用浏览器端视频分割功能

### Q2: FFmpeg 加载失败怎么办？

**A:** 可能的原因和解决方案：

1. **网络问题**
   - 检查是否能访问 unpkg.com 或 jsdelivr.com
   - 尝试使用多个 CDN 源配置
   - 检查防火墙或代理设置

2. **CORS 错误**
   - 确保使用的 CDN URL 支持 CORS
   - unpkg.com 和 jsdelivr.com 都支持 CORS

3. **版本不兼容**
   - 确保使用 @ffmpeg/core 0.12.6 版本
   - 项目使用 @ffmpeg/ffmpeg 0.12.10，需要匹配的 core 版本

### Q3: 如何选择最佳 CDN？

**A:** 推荐按以下顺序：

1. **多 CDN 配置**（最稳定）
   ```env
   VITE_FFMPEG_BASE_URL=https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd,https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd
   ```

2. **unpkg.com**（国际访问快）
   ```env
   VITE_FFMPEG_BASE_URL=https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd
   ```

3. **jsDelivr**（中国访问友好）
   ```env
   VITE_FFMPEG_BASE_URL=https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd
   ```

### Q4: FFmpeg 有什么用？

**A:** FFmpeg 用于：
- **视频分割**：将长视频（>3分钟）分割成小片段
- **并行处理**：多个片段同时生成字幕，提速 2-3 倍
- **完全客户端**：无需上传到服务器，保护隐私

对于短视频（<3分钟），不会使用 FFmpeg。

### Q5: 生产环境如何配置？

**A:** 

**Vercel 部署**：在 Vercel 项目设置中添加环境变量：
```
VITE_FFMPEG_BASE_URL=https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd
```

**自托管**：
1. 下载 @ffmpeg/core 文件到 public 目录
2. 配置本地路径：
   ```env
   VITE_FFMPEG_BASE_URL=/ffmpeg-core
   ```

## 进阶配置

### 自定义超时时间

```env
# FFmpeg 加载总超时（默认 120 秒）
VITE_FFMPEG_LOAD_TIMEOUT_MS=120000

# 单个文件下载超时（默认 45 秒）
VITE_FFMPEG_DOWNLOAD_TIMEOUT_MS=45000
```

### 多线程版本配置

多线程版本需要额外的 HTTP headers：

**vercel.json 配置**：
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "require-corp"
        },
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "same-origin"
        }
      ]
    }
  ]
}
```

然后使用：
```env
VITE_FFMPEG_BASE_URL=https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm
```

## 技术细节

### CDN 文件列表

FFmpeg 需要加载三个文件：

```
{base_url}/ffmpeg-core.js
{base_url}/ffmpeg-core.wasm
{base_url}/ffmpeg-core.worker.js
```

### 版本对应关系

| @ffmpeg/ffmpeg | @ffmpeg/core | CDN Path |
|----------------|--------------|----------|
| 0.12.10        | 0.12.6       | dist/umd |
| 0.12.10        | 0.12.6 (MT)  | dist/esm |

### 代码实现位置

- **配置读取**：`services/videoSplitterService.ts` (第 28-50 行)
- **加载逻辑**：`services/videoSplitterService.ts` (第 129-198 行)
- **使用位置**：`services/segmentedProcessor.ts`

## 相关文档

- [FFmpeg.wasm 官方文档](https://ffmpegwasm.netlify.app/)
- [视频分割功能说明](./VIDEO_SEGMENTATION.md)
- [环境变量配置](../README.md)

## 总结

FFmpeg CDN 配置是**可选的**：
- ✅ **配置了**：可以使用浏览器端视频分割，处理长视频更快
- ✅ **不配置**：系统自动降级，功能完全正常，只是处理长视频稍慢

建议配置多个 CDN 源以提高稳定性。

