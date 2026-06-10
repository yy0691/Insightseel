# 视频处理功能快速指南

## 功能概览

新增的视频处理功能将 Insightseel 从"字幕查看工具"升级为"完整视频处理工作站"，支持：

- 🎬 **多平台视频下载**（YouTube、Bilibili、TikTok 等）
- 🎙️ **高精度转写**（词级时间戳）
- 🌐 **专业翻译**（AI 润色 + 专有名词保护）
- 🎨 **字幕烧录**（单语/双语，浏览器端处理）
- 📄 **文档生成**（Markdown 格式）

## 快速开始

### 1. 基础使用

在视频详情页面，点击"完整处理"按钮：

```
[视频播放器]
[生成字幕] [翻译] [分析] [完整处理] ← 新增
```

### 2. 处理选项

- **转写引擎**: 
  - Deepgram（推荐，快速准确）
  - Whisper API（OpenAI）
  - Whisper MLX（Mac 本地 GPU）

- **翻译目标**: 
  - 不翻译（仅转写）
  - 简体中文
  - 繁体中文
  - 英语

- **字幕模式**:
  - 仅翻译（只显示译文）
  - 双语（中文大 + 英文小）

- **输出选项**:
  - ✓ 烧录字幕到视频
  - ✓ 生成 Markdown 文档

### 3. 处理流程

```
下载视频 (0-20%)
    ↓
提取音频 (20-30%)
    ↓
语音转写 (30-60%)
    ↓
翻译润色 (60-80%)
    ↓
烧录字幕 (80-95%)
    ↓
生成文档 (95-100%)
```

## 高级特性

### 词级时间戳

精确到每个单词的时间戳，用于：
- 智能断句（按语义分割）
- 精确对齐（字幕不会跑在说话人前面）
- 卡拉 OK 效果（未来支持）

### 专有名词保护

自动识别并保护技术术语：
- Claude（不译成 cloud）
- MCP（不译成 NCP）
- API、SDK、GPU 等

可在代码中自定义术语列表：

```typescript
// services/subtitlePolishService.ts
const TECHNICAL_TERMS = [
  'Claude', 'MCP', 'API', 'SDK',
  // 添加你的术语
];
```

### 双语字幕效果

使用 ASS 格式实现真正的字号差异：

```
这是中文翻译（24px，白色，贴底）
This is the original text (14px, 白色, 稍上)
```

SRT 格式无法实现此效果（force_style 对整条统一）。

## API 使用

### 仅转写

```typescript
import { transcribeWithWordTimestamps } from './services/transcriptionService';

const result = await transcribeWithWordTimestamps(
  audioFile,
  { 
    engine: 'deepgram',
    wordTimestamps: true,
    enableKeywords: true
  }
);

console.log(result.segments); // 字幕片段
console.log(result.words);    // 词级时间戳
```

### 翻译润色

```typescript
import { polishSubtitles } from './services/subtitlePolishService';

const polished = await polishSubtitles(segments, {
  targetLanguage: 'zh-CN',
  bilingualMode: 'bilingual',
  preserveTechnicalTerms: true,
  smartLineBreak: true,
  maxWordsPerLine: 15,
  maxDurationPerSegment: 5
});
```

### 烧录字幕

```typescript
import { burnSubtitles } from './services/subtitleBurnService';

const videoWithSubs = await burnSubtitles(
  videoFile,
  polishedSegments,
  {
    mode: 'bilingual',
    fontSize: 24,
    fontName: 'Arial',
    watermark: {
      text: 'Insightseel',
      position: 'x=10:y=10',
      fontSize: 12
    }
  }
);

// 下载
const url = URL.createObjectURL(videoWithSubs);
const a = document.createElement('a');
a.href = url;
a.download = 'video-with-subtitles.mp4';
a.click();
```

### 完整流程

```typescript
import { processVideoComplete } from './services/videoProcessingPipeline';

const result = await processVideoComplete(
  'https://youtube.com/watch?v=xxx', // 或 File 对象
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
    console.log(progress.message);
  }
);

// 结果
console.log(result.videoWithSubtitles); // Blob
console.log(result.markdownTranscript); // string
console.log(result.polishedSegments);   // SubtitleSegment[]
console.log(result.metadata);           // 元数据
```

## 故障排除

### 1. 视频下载失败

**问题**: YouTube 403 错误

**解决**:
- 确保安装了 yt-dlp：`brew install yt-dlp`
- 使用代理（如需要）
- 检查后端 API 日志

### 2. 转写失败

**问题**: Deepgram API 错误

**解决**:
- 检查 `VITE_DEEPGRAM_API_KEY` 是否正确
- 检查网络连接
- 尝试降级到 Whisper

### 3. 烧录失败

**问题**: FFmpeg.wasm 加载失败

**解决**:
- 检查 `/ffmpeg` 目录是否存在
- 运行 `pnpm install` 重新安装依赖
- 检查浏览器控制台错误

### 4. 中文字幕显示方块

**问题**: 字体不支持中文

**解决**:
```typescript
// 使用支持中文的字体
burnSubtitles(videoFile, segments, {
  fontName: 'Microsoft YaHei', // Windows
  // 或
  fontName: 'PingFang SC',     // macOS
  // 或
  fontName: 'Noto Sans CJK SC' // Linux
});
```

### 5. 翻译质量差

**问题**: 机翻腔调重

**解决**:
- 检查 `LLM_API_KEY` 使用的模型（推荐 Gemini 2.5 Flash）
- 启用专有名词保护
- 调整 `maxWordsPerLine` 和 `maxDurationPerSegment`

## 性能优化

### 大文件处理

对于超长视频（>60 分钟）：

1. **分段处理**: 自动将音频分割为 3.5MB 块
2. **并行转写**: 多个块同时处理
3. **流式输出**: 边转写边返回结果

### 内存优化

```typescript
// 使用 AbortSignal 取消长时间操作
const controller = new AbortController();

transcribeWithWordTimestamps(
  audioFile,
  { engine: 'deepgram' },
  undefined,
  controller.signal // 传入 signal
);

// 取消操作
controller.abort();
```

### 缓存策略

转写结果自动保存到 IndexedDB，避免重复处理：

```typescript
// 检查是否已转写
const existing = await subtitleDB.get(videoId);
if (existing) {
  console.log('使用缓存的转写结果');
  return existing.segments;
}
```

## 扩展开发

### 添加新的转写引擎

```typescript
// services/transcriptionService.ts
export async function transcribeWithCustomEngine(
  file: File,
  options: any
): Promise<TranscriptionResult> {
  // 实现你的引擎逻辑
  const response = await fetch('your-api-endpoint', {
    method: 'POST',
    body: file
  });
  
  const data = await response.json();
  
  return {
    segments: parseSegments(data),
    words: parseWords(data),
    language: data.language,
    duration: data.duration
  };
}
```

### 添加新的字幕格式

```typescript
// utils/subtitleFormats.ts
export function generateVTT(segments: SubtitleSegment[]): string {
  return 'WEBVTT\n\n' + segments.map((seg, i) => {
    const start = formatVTTTime(seg.startTime);
    const end = formatVTTTime(seg.endTime);
    return `${i + 1}\n${start} --> ${end}\n${seg.text}\n`;
  }).join('\n');
}
```

### 自定义润色规则

```typescript
// services/subtitlePolishService.ts
const prompt = `你是专业字幕翻译。任务：
1. ${customRule1}
2. ${customRule2}
3. ...

风格要求：
- 简洁直白
- 口语化表达
- 保持原意

输入字幕：
${formatSegments(segments)}
`;
```

## 最佳实践

1. **优先使用 Deepgram**: 速度快、准确率高、支持多语言
2. **启用关键词增强**: 提升专业术语识别率
3. **双语字幕用 ASS**: 实现真正的字号差异
4. **大文件先提取音频**: 减少传输和处理时间
5. **保存中间结果**: 便于调试和重新处理

## 相关资源

- [xiaohu-video-translate](https://github.com/xiaohuailabs/xiaohu-video-translate) - 设计灵感来源
- [FFmpeg.wasm 文档](https://ffmpegwasm.netlify.app/)
- [Deepgram API 文档](https://developers.deepgram.com/)
- [yt-dlp 文档](https://github.com/yt-dlp/yt-dlp)
