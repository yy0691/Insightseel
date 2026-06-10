# 集成指南

## 快速集成（3 步）

### 步骤 1：在 VideoDetail 组件中添加处理按钮

```typescript
// components/VideoDetail.tsx
import { VideoProcessingIntegration } from './VideoProcessingIntegration';

// 在现有按钮区域添加
<div className="flex gap-2">
  {/* 现有按钮 */}
  <button>生成字幕</button>
  <button>翻译</button>
  <button>分析</button>
  
  {/* 新增：完整处理 */}
  <VideoProcessingIntegration 
    videoFile={video.file} 
    videoId={video.id} 
  />
</div>
```

### 步骤 2：在主界面添加批量处理入口

```typescript
// components/Sidebar.tsx 或主界面
import { useState } from 'react';
import BatchProcessingModal from './BatchProcessingModal';

export function MainInterface() {
  const [showBatch, setShowBatch] = useState(false);

  return (
    <>
      {/* 在导航栏或工具栏添加 */}
      <button 
        onClick={() => setShowBatch(true)}
        className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg"
      >
        <svg>...</svg>
        批量处理
      </button>

      <BatchProcessingModal 
        isOpen={showBatch} 
        onClose={() => setShowBatch(false)} 
      />
    </>
  );
}
```

### 步骤 3：安装后端依赖

```bash
# macOS
brew install yt-dlp ffmpeg

# Ubuntu/Debian
sudo apt install yt-dlp ffmpeg

# Windows
winget install yt-dlp
winget install ffmpeg
```

## 完整示例

### 单个视频处理

```typescript
import { processVideoComplete } from './services/videoProcessingPipeline';

async function handleProcess() {
  try {
    const result = await processVideoComplete(
      videoFile, // 或 YouTube URL
      {
        transcriptionEngine: 'deepgram',
        translateTo: 'zh-CN',
        subtitleMode: 'bilingual',
        burnSubtitles: true,
        generateMarkdown: true,
        preserveTechnicalTerms: true,
        fontSize: 24
      },
      (progress) => {
        console.log(`${progress.stage}: ${progress.progress}%`);
        setProgress(progress);
      }
    );

    // 下载视频
    if (result.videoWithSubtitles) {
      const url = URL.createObjectURL(result.videoWithSubtitles);
      downloadFile(url, 'video-with-subtitles.mp4');
    }

    // 下载文档
    if (result.markdownTranscript) {
      downloadFile(
        new Blob([result.markdownTranscript], { type: 'text/markdown' }),
        'transcript.md'
      );
    }
  } catch (error) {
    console.error('处理失败:', error);
    alert(error.message);
  }
}
```

### 批量处理

```typescript
import { processBatch } from './services/batchProcessingService';

async function handleBatchProcess() {
  const sources = [
    'https://youtube.com/watch?v=xxx',
    videoFile1,
    videoFile2,
    'https://bilibili.com/video/BVxxx'
  ];

  const jobs = await processBatch(
    sources,
    {
      transcriptionEngine: 'deepgram',
      translateTo: 'zh-CN',
      subtitleMode: 'bilingual',
      burnSubtitles: true,
      generateMarkdown: true
    },
    (progress) => {
      console.log(`完成: ${progress.completedJobs}/${progress.totalJobs}`);
      setProgress(progress);
    },
    2 // 并发数
  );

  // 导出为 ZIP
  const zipBlob = await exportBatchResults(jobs, 'zip');
  downloadFile(zipBlob, 'batch-results.zip');
}
```

## 常见问题

### Q1: 视频下载失败（403 错误）

**解决方案**:
```bash
# 确保 yt-dlp 是最新版本
brew upgrade yt-dlp  # macOS
pip3 install -U yt-dlp  # 其他平台

# 如需代理
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
```

### Q2: FFmpeg.wasm 加载失败

**解决方案**:
```bash
# 确保 /public/ffmpeg 目录存在
ls public/ffmpeg/

# 如果不存在，重新安装
pnpm install
```

### Q3: 中文字幕显示方块

**解决方案**:
```typescript
// 使用支持中文的字体
burnSubtitles(videoFile, segments, {
  fontName: 'Microsoft YaHei',  // Windows
  // 或
  fontName: 'PingFang SC',      // macOS
  // 或
  fontName: 'Noto Sans CJK SC'  // Linux
});
```

### Q4: 转写速度慢

**解决方案**:
- 使用 Deepgram（最快）
- 对于 Mac，使用 Whisper MLX（本地 GPU）
- 减少并发处理数量

## 测试

### 运行测试

```bash
# 单元测试
pnpm test

# 特定测试文件
pnpm test videoProcessing.test.ts

# 覆盖率
pnpm test -- --coverage
```

### 手动测试清单

- [ ] 单个视频转写
- [ ] 视频翻译（中文）
- [ ] 双语字幕生成
- [ ] 字幕烧录
- [ ] YouTube 视频下载
- [ ] 批量处理（2-3 个视频）
- [ ] 播放列表导入
- [ ] ZIP 导出

## 性能优化

### 大文件处理

```typescript
// 对于超长视频（>60 分钟），音频会自动分块处理
const result = await transcribeWithWordTimestamps(
  audioFile,
  { engine: 'deepgram' }
);
// Deepgram 会自动将音频分割为 ≤3.5MB 的块
```

### 内存优化

```typescript
// 使用 AbortSignal 取消操作
const controller = new AbortController();

processVideoComplete(
  videoFile,
  options,
  onProgress,
  controller.signal  // 传入信号
);

// 用户取消时
controller.abort();
```

### 并发控制

```typescript
// 批量处理时控制并发数
processBatch(
  sources,
  options,
  onProgress,
  2  // 同时处理 2 个视频（避免 OOM）
);
```

## 部署

### Vercel 部署

```bash
# 1. 环境变量
VITE_DEEPGRAM_API_KEY=你的密钥
LLM_API_KEY=你的密钥
VITE_USE_PROXY=true

# 2. 构建配置（vercel.json）
{
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 300
    }
  }
}

# 3. 部署
vercel deploy --prod
```

### 服务器部署

```bash
# 1. 安装系统依赖
apt install yt-dlp ffmpeg  # Ubuntu

# 2. 构建前端
pnpm build

# 3. 启动服务
pnpm preview
```

## 扩展开发

### 添加新的转写引擎

```typescript
// services/transcriptionService.ts
export async function transcribeWithCustomEngine(
  file: File
): Promise<TranscriptionResult> {
  // 实现你的引擎
  const response = await fetch('your-api', {
    method: 'POST',
    body: file
  });
  
  return {
    segments: parseSegments(response),
    words: parseWords(response),
    language: response.language
  };
}

// 注册引擎
export type TranscriptionEngine = 
  | 'deepgram' 
  | 'whisper' 
  | 'whisper-mlx'
  | 'custom';  // 新增
```

### 自定义字幕样式

```typescript
// utils/subtitleFormats.ts
export function generateCustomASS(
  segments: SubtitleSegment[]
): string {
  return `[Script Info]
Title: Custom Subtitles
...

[V4+ Styles]
Style: MyStyle,Arial,28,&H00FFFFFF,...

[Events]
${segments.map(seg => 
  `Dialogue: 0,${formatTime(seg.start)},${formatTime(seg.end)},MyStyle,,0,0,0,,${seg.text}`
).join('\n')}`;
}
```

## 支持

如有问题，请查看：
- [技术文档](./docs/video-processing-upgrade.md)
- [使用指南](./docs/video-processing-guide.md)
- [GitHub Issues](https://github.com/yourusername/insightseel/issues)
