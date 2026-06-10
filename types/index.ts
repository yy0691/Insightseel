/**
 * 更新后的类型导出 - 包含视频处理相关类型
 */

export * from './types';

// 新增视频处理相关类型
export type TranscriptionEngine = 'deepgram' | 'whisper' | 'whisper-mlx';
export type TargetLanguage = 'zh-CN' | 'zh-TW' | 'en';
export type SubtitleMode = 'translation-only' | 'bilingual';

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface TranscriptionMetadata {
  duration: number;
  language?: string;
  wordCount: number;
  engine: TranscriptionEngine;
}

export interface VideoProcessingSettings {
  transcriptionEngine: TranscriptionEngine;
  targetLanguage?: TargetLanguage;
  subtitleMode: SubtitleMode;
  fontSize: number;
  fontName: string;
  preserveTechnicalTerms: boolean;
  enableKeywords: boolean;
}
