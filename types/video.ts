/**
 * 扩展 SubtitleSegment 类型以支持翻译和原文
 */

export interface SubtitleSegment {
  startTime: number;
  endTime: number;
  text: string;
  translation?: string;
  originalText?: string;
  confidence?: number;
}

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
  engine: 'deepgram' | 'whisper' | 'whisper-mlx';
}

export interface VideoProcessingSettings {
  transcriptionEngine: 'deepgram' | 'whisper' | 'whisper-mlx';
  targetLanguage?: 'zh-CN' | 'zh-TW' | 'en';
  subtitleMode: 'translation-only' | 'bilingual';
  fontSize: number;
  fontName: string;
  preserveTechnicalTerms: boolean;
  enableKeywords: boolean;
}
