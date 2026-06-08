import { describe, it, expect, vi } from 'vitest';
import {
  parseSrt,
  parseVtt,
  parseSubtitleFile,
  segmentsToSrt,
  formatTimestamp,
  parseTimestampToSeconds,
  retryWithBackoff,
  generateDeterministicUUID,
} from '../utils/helpers';
import type { SubtitleSegment } from '../types';

describe('parseSrt', () => {
  it('parses multiple cues with HH:MM:SS,mmm timestamps', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:04,000',
      'Hello world',
      '',
      '2',
      '00:00:05,500 --> 00:00:08,250',
      'Second line',
    ].join('\n');

    const segments = parseSrt(srt);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ startTime: 1, endTime: 4, text: 'Hello world' });
    expect(segments[1].startTime).toBeCloseTo(5.5, 3);
    expect(segments[1].endTime).toBeCloseTo(8.25, 3);
    expect(segments[1].text).toBe('Second line');
  });

  it('preserves multi-line cue text', () => {
    const srt = ['1', '00:00:00,000 --> 00:00:02,000', 'Line A', 'Line B'].join('\n');
    const segments = parseSrt(srt);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Line A\nLine B');
  });

  it('tolerates carriage returns and skips malformed blocks', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nOK\r\n\r\nnot-a-cue';
    const segments = parseSrt(srt);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('OK');
  });
});

describe('parseVtt', () => {
  it('skips the WEBVTT header and parses dotted timestamps', () => {
    const vtt = [
      'WEBVTT',
      '',
      '00:00:01.000 --> 00:00:04.000',
      'Hello',
      '',
      '00:00:05.000 --> 00:00:06.000 align:start',
      'World',
    ].join('\n');

    const segments = parseVtt(vtt);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ startTime: 1, endTime: 4, text: 'Hello' });
    // alignment tag after the end timestamp must be ignored
    expect(segments[1].endTime).toBe(6);
  });

  it('supports MM:SS timestamps', () => {
    const vtt = ['WEBVTT', '', '01:30.000 --> 01:32.000', 'Short'].join('\n');
    const segments = parseVtt(vtt);
    expect(segments).toHaveLength(1);
    expect(segments[0].startTime).toBe(90);
    expect(segments[0].endTime).toBe(92);
  });
});

describe('parseSubtitleFile', () => {
  it('routes by file extension', () => {
    const srt = ['1', '00:00:01,000 --> 00:00:02,000', 'srt'].join('\n');
    const vtt = ['WEBVTT', '', '00:00:01.000 --> 00:00:02.000', 'vtt'].join('\n');
    expect(parseSubtitleFile('a.srt', srt)[0].text).toBe('srt');
    expect(parseSubtitleFile('a.vtt', vtt)[0].text).toBe('vtt');
  });

  it('throws on unsupported formats', () => {
    expect(() => parseSubtitleFile('a.ass', '')).toThrow(/Unsupported subtitle format/);
  });
});

describe('segmentsToSrt', () => {
  it('serializes segments into valid SRT', () => {
    const segments: SubtitleSegment[] = [
      { startTime: 1, endTime: 4, text: 'Hello' },
      { startTime: 5.5, endTime: 8, text: 'World' },
    ];
    const srt = segmentsToSrt(segments);
    expect(srt).toContain('1\n00:00:01,000 --> 00:00:04,000\nHello');
    expect(srt).toContain('2\n00:00:05,500 --> 00:00:08,000\nWorld');
  });

  it('round-trips through parseSrt', () => {
    const segments: SubtitleSegment[] = [
      { startTime: 0, endTime: 2.5, text: 'A' },
      { startTime: 10.25, endTime: 12.75, text: 'B' },
    ];
    const parsed = parseSrt(segmentsToSrt(segments));
    expect(parsed).toHaveLength(2);
    parsed.forEach((seg, i) => {
      expect(seg.startTime).toBeCloseTo(segments[i].startTime, 2);
      expect(seg.endTime).toBeCloseTo(segments[i].endTime, 2);
      expect(seg.text).toBe(segments[i].text);
    });
  });
});

describe('timestamp helpers', () => {
  it('formats seconds into HH:MM:SS', () => {
    expect(formatTimestamp(0)).toBe('00:00:00');
    expect(formatTimestamp(3661)).toBe('01:01:01');
    expect(formatTimestamp(NaN)).toBe('00:00:00');
  });

  it('parses HH:MM:SS and MM:SS', () => {
    expect(parseTimestampToSeconds('01:01:01')).toBe(3661);
    expect(parseTimestampToSeconds('02:30')).toBe(150);
  });
});

describe('retryWithBackoff', () => {
  it('returns immediately on success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(retryWithBackoff(fn, 3, 1)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries retryable errors then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('done');
    await expect(retryWithBackoff(fn, 3, 1)).resolves.toBe('done');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Invalid API key'));
    await expect(retryWithBackoff(fn, 3, 1)).rejects.toThrow('Invalid API key');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('generateDeterministicUUID', () => {
  it('is deterministic and valid UUID v4 shape', async () => {
    const a = await generateDeterministicUUID('video-123.mp4');
    const b = await generateDeterministicUUID('video-123.mp4');
    const c = await generateDeterministicUUID('other.mp4');
    const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(uuidV4);
  });
});
