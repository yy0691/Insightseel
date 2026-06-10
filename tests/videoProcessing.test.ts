/**
 * 测试套件 - 视频处理功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { transcribeWithWordTimestamps } from '../services/transcriptionService';
import { polishSubtitles } from '../services/subtitlePolishService';
import { generateSRT, generateBilingualASS, parseSRT } from '../utils/subtitleFormats';
import { SubtitleSegment } from '../types';

describe('Video Processing Functions', () => {
  describe('Subtitle Formats', () => {
    const mockSegments: SubtitleSegment[] = [
      { startTime: 0, endTime: 3.5, text: 'Hello world', translation: '你好世界' },
      { startTime: 3.5, endTime: 7, text: 'This is a test', translation: '这是测试' }
    ];

    it('should generate SRT format correctly', () => {
      const srt = generateSRT(mockSegments, 'single');
      expect(srt).toContain('1\n00:00:00,000 --> 00:00:03,500');
      expect(srt).toContain('你好世界');
    });

    it('should generate bilingual SRT', () => {
      const srt = generateSRT(mockSegments, 'bilingual');
      expect(srt).toContain('你好世界\nHello world');
    });

    it('should generate ASS format for bilingual subtitles', () => {
      const ass = generateBilingualASS(mockSegments, {
        chineseSize: 24,
        englishSize: 14
      });
      expect(ass).toContain('[Script Info]');
      expect(ass).toContain('Style: Chinese');
      expect(ass).toContain('Style: English');
      expect(ass).toContain('Dialogue:');
    });

    it('should parse SRT correctly', () => {
      const srtContent = `1
00:00:00,000 --> 00:00:03,500
你好世界

2
00:00:03,500 --> 00:00:07,000
这是测试
`;
      const segments = parseSRT(srtContent);
      expect(segments).toHaveLength(2);
      expect(segments[0].text).toBe('你好世界');
      expect(segments[0].startTime).toBe(0);
      expect(segments[0].endTime).toBe(3.5);
    });
  });

  describe('Subtitle Polish Service', () => {
    it('should preserve technical terms', async () => {
      const mockSegments: SubtitleSegment[] = [
        { startTime: 0, endTime: 3, text: 'Claude is an AI assistant' }
      ];

      // Mock LLM call
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '1|0.00-3.00|Claude 是一个 AI 助手'
            }
          }]
        })
      });

      const result = await polishSubtitles(mockSegments, {
        targetLanguage: 'zh-CN',
        preserveTechnicalTerms: true
      });

      expect(result[0].translation).toContain('Claude');
      expect(result[0].translation).not.toContain('cloud');
    });
  });

  describe('Video Downloader', () => {
    it('should detect supported platforms', async () => {
      const { isSupportedPlatform } = await import('../utils/videoDownloader');

      expect(isSupportedPlatform('https://youtube.com/watch?v=xxx')).toBe(true);
      expect(isSupportedPlatform('https://youtu.be/xxx')).toBe(true);
      expect(isSupportedPlatform('https://bilibili.com/video/BVxxx')).toBe(true);
      expect(isSupportedPlatform('https://example.com/video')).toBe(false);
    });
  });

  describe('Transcription Service', () => {
    it('should handle word timestamps correctly', async () => {
      const mockFile = new File([''], 'test.mp3', { type: 'audio/mpeg' });

      // Mock Deepgram response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          metadata: { duration: 10 },
          results: {
            channels: [{
              alternatives: [{
                transcript: 'Hello world',
                words: [
                  { word: 'Hello', start: 0, end: 0.5, confidence: 0.9 },
                  { word: 'world', start: 0.5, end: 1.0, confidence: 0.95 }
                ]
              }]
            }]
          }
        })
      });

      const result = await transcribeWithWordTimestamps(
        mockFile,
        { engine: 'deepgram', wordTimestamps: true }
      );

      expect(result.words).toBeDefined();
      expect(result.words?.length).toBe(2);
      expect(result.words?.[0].word).toBe('Hello');
    });
  });
});
