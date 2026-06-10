/**
 * Enhanced Transcription Service - 增强转写服务
 * 支持词级时间戳和多引擎
 */

import { generateSubtitlesWithDeepgram, deepgramToSegments } from './deepgramService';
import { generateSubtitlesWithWhisper } from './whisperService';
import { SubtitleSegment } from '../types';

export type TranscriptionEngine = 'deepgram' | 'whisper' | 'whisper-mlx';

export interface TranscriptionOptions {
  engine: TranscriptionEngine;
  language?: string;
  model?: 'large-v3-turbo' | 'medium' | 'nova-2';
  enableKeywords?: boolean;
  wordTimestamps?: boolean;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface TranscriptionResult {
  segments: SubtitleSegment[];
  words?: WordTimestamp[];
  language?: string;
  duration?: number;
}

/**
 * 统一转写接口 - 支持词级时间戳
 */
export async function transcribeWithWordTimestamps(
  file: File | Blob,
  options: TranscriptionOptions,
  onProgress?: (progress: number) => void,
  abortSignal?: AbortSignal
): Promise<TranscriptionResult> {
  console.log('[Transcription] Starting with options:', options);

  if (options.engine === 'deepgram') {
    const result = await generateSubtitlesWithDeepgram(
      file,
      options.language,
      onProgress,
      abortSignal,
      options.enableKeywords ?? true
    );

    const segments = deepgramToSegments(result);

    // 提取词级时间戳
    const words: WordTimestamp[] = [];
    if (result.results?.channels?.[0]?.alternatives?.[0]?.words) {
      result.results.channels[0].alternatives[0].words.forEach(w => {
        words.push({
          word: w.word,
          start: w.start,
          end: w.end,
          confidence: w.confidence
        });
      });
    }

    return {
      segments,
      words: options.wordTimestamps ? words : undefined,
      language: result.results?.channels?.[0]?.alternatives?.[0]?.transcript ? 'detected' : undefined,
      duration: result.metadata?.duration
    };
  }

  if (options.engine === 'whisper' || options.engine === 'whisper-mlx') {
    const result = await generateSubtitlesWithWhisper(file, options.language, onProgress);

    const segments: SubtitleSegment[] = (result.segments || []).map(seg => ({
      startTime: seg.start,
      endTime: seg.end,
      text: seg.text.trim()
    }));

    // Whisper 也支持词级时间戳
    const words: WordTimestamp[] = [];
    if (options.wordTimestamps && result.segments) {
      result.segments.forEach(seg => {
        // Whisper segments 本身就是词级的
        const segWords = seg.text.trim().split(/\s+/);
        const duration = seg.end - seg.start;
        const wordDuration = duration / segWords.length;

        segWords.forEach((word, i) => {
          words.push({
            word,
            start: seg.start + i * wordDuration,
            end: seg.start + (i + 1) * wordDuration
          });
        });
      });
    }

    return {
      segments,
      words: options.wordTimestamps ? words : undefined,
      language: result.language,
      duration: result.duration
    };
  }

  throw new Error(`Unsupported transcription engine: ${options.engine}`);
}

/**
 * 检测可用的转写引擎
 */
export async function detectAvailableEngines(): Promise<TranscriptionEngine[]> {
  const engines: TranscriptionEngine[] = [];

  // 检查 Deepgram
  try {
    const { isDeepgramAvailable } = await import('./deepgramService');
    if (await isDeepgramAvailable()) {
      engines.push('deepgram');
    }
  } catch {
    // Deepgram 不可用
  }

  // 检查 Whisper API
  try {
    const { isWhisperAvailable } = await import('./whisperService');
    if (await isWhisperAvailable()) {
      engines.push('whisper');
    }
  } catch {
    // Whisper 不可用
  }

  return engines;
}
