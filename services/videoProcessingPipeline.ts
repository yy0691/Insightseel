/**
 * Video Processing Pipeline - 完整视频处理流程
 * 下载 → 转写 → 翻译 → 烧录 → 生成文档
 */

import { SubtitleSegment } from '../types';
import { downloadVideo, isSupportedPlatform } from '../utils/videoDownloader';
import { transcribeWithWordTimestamps, TranscriptionEngine } from './transcriptionService';
import { polishSubtitles, TargetLanguage, SubtitleMode } from './subtitlePolishService';
import { burnSubtitles, extractAudio } from './subtitleBurnService';

export interface PipelineOptions {
  transcriptionEngine: TranscriptionEngine;
  translateTo?: TargetLanguage;
  subtitleMode?: SubtitleMode;
  burnSubtitles: boolean;
  generateMarkdown: boolean;
  preserveTechnicalTerms?: boolean;
  fontSize?: number;
}

export interface PipelineResult {
  videoWithSubtitles?: Blob;
  markdownTranscript?: string;
  rawSegments: SubtitleSegment[];
  polishedSegments?: SubtitleSegment[];
  metadata?: {
    duration: number;
    language?: string;
    wordCount: number;
  };
}

export interface PipelineProgress {
  stage: 'download' | 'extract-audio' | 'transcribe' | 'translate' | 'burn' | 'markdown';
  progress: number;
  message: string;
}

/**
 * 完整视频处理流程
 */
export async function processVideoComplete(
  input: string | File,
  options: PipelineOptions,
  onProgress?: (progress: PipelineProgress) => void
): Promise<PipelineResult> {
  console.log('[Pipeline] Starting video processing...', { options });

  let videoFile: File;

  // 步骤 1: 下载视频（如果是 URL）
  if (typeof input === 'string') {
    if (!isSupportedPlatform(input)) {
      throw new Error('Unsupported video platform');
    }

    onProgress?.({ stage: 'download', progress: 0, message: '下载视频中...' });

    const downloadResult = await downloadVideo(input, { format: 'video' });
    if (!downloadResult.success || !downloadResult.filePath) {
      throw new Error(downloadResult.error || 'Download failed');
    }

    // 注意：这里需要从服务器获取文件，实际实现需要调整
    const response = await fetch(downloadResult.filePath);
    const blob = await response.blob();
    videoFile = new File([blob], 'video.mp4', { type: 'video/mp4' });

    onProgress?.({ stage: 'download', progress: 100, message: '下载完成' });
  } else {
    videoFile = input;
  }

  // 步骤 2: 提取音频
  onProgress?.({ stage: 'extract-audio', progress: 0, message: '提取音频中...' });

  const audioFile = await extractAudio(videoFile, (progress) => {
    onProgress?.({ stage: 'extract-audio', progress, message: '提取音频中...' });
  });

  onProgress?.({ stage: 'extract-audio', progress: 100, message: '音频提取完成' });

  // 步骤 3: 转写（词级时间戳）
  onProgress?.({ stage: 'transcribe', progress: 0, message: '转写中...' });

  const transcription = await transcribeWithWordTimestamps(
    audioFile,
    {
      engine: options.transcriptionEngine,
      wordTimestamps: true,
      enableKeywords: true
    },
    (progress) => {
      onProgress?.({ stage: 'transcribe', progress, message: '转写中...' });
    }
  );

  onProgress?.({ stage: 'transcribe', progress: 100, message: '转写完成' });

  let polishedSegments = transcription.segments;

  // 步骤 4: 翻译 + 润色
  if (options.translateTo) {
    onProgress?.({ stage: 'translate', progress: 0, message: '翻译润色中...' });

    polishedSegments = await polishSubtitles(transcription.segments, {
      targetLanguage: options.translateTo,
      bilingualMode: options.subtitleMode || 'translation-only',
      preserveTechnicalTerms: options.preserveTechnicalTerms ?? true,
      smartLineBreak: true
    });

    onProgress?.({ stage: 'translate', progress: 100, message: '翻译完成' });
  }

  // 步骤 5: 烧录字幕
  let videoWithSubtitles: Blob | undefined;
  if (options.burnSubtitles) {
    onProgress?.({ stage: 'burn', progress: 0, message: '烧录字幕中...' });

    videoWithSubtitles = await burnSubtitles(
      videoFile,
      polishedSegments,
      {
        mode: options.subtitleMode || 'translation-only',
        fontSize: options.fontSize || 24
      },
      (progress) => {
        onProgress?.({ stage: 'burn', progress, message: '烧录字幕中...' });
      }
    );

    onProgress?.({ stage: 'burn', progress: 100, message: '烧录完成' });
  }

  // 步骤 6: 生成 Markdown
  let markdownTranscript: string | undefined;
  if (options.generateMarkdown) {
    onProgress?.({ stage: 'markdown', progress: 50, message: '生成文档中...' });
    markdownTranscript = generateMarkdownTranscript(polishedSegments, transcription.language);
    onProgress?.({ stage: 'markdown', progress: 100, message: '文档生成完成' });
  }

  // 元数据
  const metadata = {
    duration: transcription.duration || 0,
    language: transcription.language,
    wordCount: polishedSegments.reduce((sum, seg) => sum + seg.text.split(/\s+/).length, 0)
  };

  console.log('[Pipeline] Processing complete', metadata);

  return {
    videoWithSubtitles,
    markdownTranscript,
    rawSegments: transcription.segments,
    polishedSegments,
    metadata
  };
}

/**
 * 生成 Markdown 文档
 */
function generateMarkdownTranscript(segments: SubtitleSegment[], language?: string): string {
  const title = '# 视频转写文档\n\n';
  const meta = `**语言**: ${language || '未知'}\n**片段数**: ${segments.length}\n\n---\n\n`;

  const content = segments.map((seg, i) => {
    const timestamp = `[${formatTimestamp(seg.startTime)} - ${formatTimestamp(seg.endTime)}]`;
    const text = 'translation' in seg && seg.translation ? seg.translation : seg.text;

    return `### ${i + 1}. ${timestamp}\n\n${text}\n`;
  }).join('\n');

  return title + meta + content;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * 快速处理（仅转写 + Markdown）
 */
export async function processVideoQuick(
  input: string | File,
  engine: TranscriptionEngine,
  onProgress?: (progress: PipelineProgress) => void
): Promise<{ markdown: string; segments: SubtitleSegment[] }> {
  const result = await processVideoComplete(
    input,
    {
      transcriptionEngine: engine,
      burnSubtitles: false,
      generateMarkdown: true
    },
    onProgress
  );

  return {
    markdown: result.markdownTranscript!,
    segments: result.rawSegments
  };
}
