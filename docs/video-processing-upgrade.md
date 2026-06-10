# 视频处理功能升级说明

本次更新基于 xiaohu-video-translate 项目的优秀设计，为 Insightseel 添加了完整的视频处理工作流。

## 新增功能

### 阶段 1：核心功能增强

1. **视频下载支持** (`utils/videoDownloader.ts`)
   - 支持多平台视频下载（YouTube、Bilibili、TikTok 等）
   - 基于 yt-dlp 的后端下载服务
   - 视频信息获取（不下载）

2. **词级时间戳** (`services/transcriptionService.ts`)
   - 统一转写接口，支持词级时间戳
   - 多引擎支持（Deepgram、Whisper、Whisper MLX）
   - 自动引擎检测和降级

3. **字幕润色服务** (`services/subtitlePolishService.ts`)
   - 专业翻译管线（纠错 + 翻译 + 断句）
   - 专有名词保护（Claude、MCP、API 等）
   - 智能断句和语义优化

### 阶段 2：高级功能

4. **字幕烧录** (`services/subtitleBurnService.ts`)
   - 基于 FFmpeg.wasm 的浏览器端烧录
   - 支持 SRT 和 ASS 格式
   - 音频提取功能

5. **双语字幕支持** (`utils/subtitleFormats.ts`)
   - SRT 格式生成和解析
   - ASS 格式生成（支持字号差异）
   - 双语字幕（中文大、英文小）

6. **完整工作流** (`services/videoProcessingPipeline.ts`)
   - 端到端视频处理流程
   - 下载 → 转写 → 翻译 → 烧录 → 文档
   - 进度追踪和错误处理

### 阶段 3：用户界面

7. **视频处理界面** (`components/VideoProcessingModal.tsx`)
   - 友好的视频处理 UI
   - 实时进度显示
   - 结果下载和预览

## 文件结构

```
Insightseel/
├── api/
│   ├── download-video.ts       # 视频下载 API
│   └── video-info.ts           # 视频信息 API
├── services/
│   ├── transcriptionService.ts # 增强转写服务
│   ├── subtitlePolishService.ts # 字幕润色服务
│   ├── subtitleBurnService.ts  # 字幕烧录服务
│   └── videoProcessingPipeline.ts # 完整处理流程
├── utils/
│   ├── videoDownloader.ts      # 视频下载工具
│   └── subtitleFormats.ts      # 字幕格式工具
├── components/
│   └── VideoProcessingModal.tsx # 视频处理界面
└── types/
    ├── index.ts                # 类型导出
    └── video.ts                # 视频相关类型
```

## 使用示例

### 1. 基础转写

```typescript
import { transcribeWithWordTimestamps } from './services/transcriptionService';

const result = await transcribeWithWordTimestamps(
  audioFile,
  { engine: 'deepgram', wordTimestamps: true },
  (progress) => console.log(`进度: ${progress}%`)
);
```

### 2. 翻译和润色

```typescript
import { polishSubtitles } from './services/subtitlePolishService';

const polished = await polishSubtitles(segments, {
  targetLanguage: 'zh-CN',
  bilingualMode: 'bilingual',
  preserveTechnicalTerms: true
});
```

### 3. 烧录字幕

```typescript
import { burnSubtitles } from './services/subtitleBurnService';

const videoWithSubs = await burnSubtitles(
  videoFile,
  segments,
  { mode: 'bilingual', fontSize: 24 },
  (progress) => console.log(`烧录: ${progress}%`)
);
```

### 4. 完整流程

```typescript
import { processVideoComplete } from './services/videoProcessingPipeline';

const result = await processVideoComplete(
  'https://youtube.com/watch?v=xxx',
  {
    transcriptionEngine: 'deepgram',
    translateTo: 'zh-CN',
    subtitleMode: 'bilingual',
    burnSubtitles: true,
    generateMarkdown: true
  },
  (progress) => console.log(progress)
);
```

## 后端依赖

### 必需安装

```bash
# macOS
brew install yt-dlp ffmpeg

# Ubuntu/Debian
sudo apt install yt-dlp ffmpeg

# Windows
winget install yt-dlp
winget install ffmpeg
```

### 可选安装（本地 Whisper）

```bash
# macOS (Apple Silicon)
pip3 install mlx-whisper

# 其他平台
pip3 install faster-whisper
```

## 环境变量

已有的环境变量无需修改，新功能复用现有配置：

- `VITE_DEEPGRAM_API_KEY` - Deepgram 转写
- `LLM_API_KEY` - 翻译和润色
- `VITE_USE_PROXY` - 代理模式

## 技术亮点

1. **词级时间戳**: 从 Deepgram/Whisper 获取精确的词级时间戳，用于智能断句
2. **专有名词保护**: 自动识别和保护技术术语（Claude、MCP、API 等）
3. **双语字幕**: 使用 ASS 格式实现中文大、英文小的视觉效果
4. **浏览器端烧录**: FFmpeg.wasm 实现完全前端化的字幕烧录
5. **渐进式处理**: 支持分批处理长视频，避免内存溢出

## 兼容性

- ✅ 完全向后兼容现有功能
- ✅ 扩展现有类型，不破坏已有代码
- ✅ 新功能独立模块化，可选择性使用
- ✅ 保持现有 Deepgram + Whisper 双引擎架构

## 下一步

1. 在主界面添加"完整处理"按钮，打开 `VideoProcessingModal`
2. 测试完整工作流（下载 → 转写 → 翻译 → 烧录）
3. 优化 UI 交互和错误提示
4. 添加批量处理支持

## 参考

- [xiaohu-video-translate](https://github.com/xiaohuailabs/xiaohu-video-translate) - 核心设计灵感来源
- [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) - 浏览器端视频处理
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - 多平台视频下载
