/**
 * Subtitle Burn Service - 字幕烧录服务
 * 使用 FFmpeg.wasm 在浏览器端烧录字幕
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { SubtitleSegment } from '../types';
import { generateSRT, generateBilingualASS } from '../utils/subtitleFormats';

let ffmpegInstance: FFmpeg | null = null;

export interface BurnOptions {
  mode: 'translation-only' | 'bilingual';
  fontSize?: number;
  fontName?: string;
  position?: 'bottom' | 'top';
  watermark?: {
    text: string;
    position: string;
    fontSize?: number;
  };
}

/**
 * 初始化 FFmpeg
 */
async function initFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;

  const ffmpeg = new FFmpeg();

  // 加载 FFmpeg WASM
  const baseURL = import.meta.env.VITE_FFMPEG_BASE_URL || '/ffmpeg';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

/**
 * 烧录字幕到视频
 */
export async function burnSubtitles(
  videoFile: File,
  segments: SubtitleSegment[],
  options: BurnOptions,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  console.log('[Burn] Starting subtitle burn...', {
    mode: options.mode,
    segments: segments.length
  });

  const ffmpeg = await initFFmpeg();

  // 写入视频文件
  const videoData = await videoFile.arrayBuffer();
  await ffmpeg.writeFile('input.mp4', new Uint8Array(videoData));

  onProgress?.(10);

  // 生成字幕文件
  if (options.mode === 'bilingual') {
    // 双语模式：生成 ASS
    const assContent = generateBilingualASS(segments, {
      chineseSize: options.fontSize || 24,
      fontName: options.fontName || 'Arial'
    });
    await ffmpeg.writeFile('subtitles.ass', new TextEncoder().encode(assContent));
  } else {
    // 单语模式：生成 SRT
    const srtContent = generateSRT(segments, 'single');
    await ffmpeg.writeFile('subtitles.srt', new TextEncoder().encode(srtContent));
  }

  onProgress?.(30);

  // 构建 FFmpeg 命令
  const args = buildFFmpegArgs(options);

  // 监听进度
  ffmpeg.on('progress', ({ progress }) => {
    onProgress?(30 + progress * 60);
  });

  // 执行烧录
  await ffmpeg.exec(args);

  onProgress?.(95);

  // 读取输出文件
  const data = await ffmpeg.readFile('output.mp4');
  const blob = new Blob([data], { type: 'video/mp4' });

  onProgress?.(100);

  console.log('[Burn] Subtitle burn complete');
  return blob;
}

/**
 * 构建 FFmpeg 参数
 */
function buildFFmpegArgs(options: BurnOptions): string[] {
  const args = ['-i', 'input.mp4'];

  // 字幕滤镜
  let videoFilter = '';

  if (options.mode === 'bilingual') {
    // 双语 ASS
    videoFilter = 'ass=subtitles.ass';
  } else {
    // 单语 SRT
    const fontSize = options.fontSize || 24;
    const fontName = options.fontName || 'Arial';
    videoFilter = `subtitles=subtitles.srt:force_style='FontName=${fontName},FontSize=${fontSize},Alignment=2'`;
  }

  // 添加水印
  if (options.watermark) {
    const { text, position, fontSize = 12 } = options.watermark;
    const watermarkFilter = `drawtext=text='${text}':fontsize=${fontSize}:fontcolor=white@0.5:${position}`;
    videoFilter += `,${watermarkFilter}`;
  }

  args.push('-vf', videoFilter);
  args.push('-c:a', 'copy'); // 音频直接复制
  args.push('-preset', 'fast');
  args.push('output.mp4');

  return args;
}

/**
 * 提取视频的音频
 */
export async function extractAudio(videoFile: File, onProgress?: (progress: number) => void): Promise<Blob> {
  const ffmpeg = await initFFmpeg();

  const videoData = await videoFile.arrayBuffer();
  await ffmpeg.writeFile('input.mp4', new Uint8Array(videoData));

  ffmpeg.on('progress', ({ progress }) => {
    onProgress?.(progress * 100);
  });

  await ffmpeg.exec([
    '-i', 'input.mp4',
    '-vn', // 不要视频
    '-acodec', 'libmp3lame',
    '-q:a', '2',
    'output.mp3'
  ]);

  const data = await ffmpeg.readFile('output.mp3');
  return new Blob([data], { type: 'audio/mpeg' });
}

/**
 * 获取视频元信息
 */
export async function getVideoMetadata(videoFile: File): Promise<{
  width: number;
  height: number;
  duration: number;
  codec: string;
}> {
  const ffmpeg = await initFFmpeg();

  const videoData = await videoFile.arrayBuffer();
  await ffmpeg.writeFile('input.mp4', new Uint8Array(videoData));

  // 使用 ffprobe 获取信息（FFmpeg.wasm 可能不支持，这里简化处理）
  // 实际应用中可能需要后端支持
  return {
    width: 1920,
    height: 1080,
    duration: 0,
    codec: 'h264'
  };
}
