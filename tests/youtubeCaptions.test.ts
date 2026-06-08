import { describe, it, expect } from 'vitest';
import {
  extractVideoId,
  getTrackName,
  decodeEntities,
  parseJson3Captions,
  parseXmlCaptions,
  withFormat,
  extractBalancedJson,
} from '../api/youtube-captions';

describe('extractVideoId', () => {
  it('extracts id from standard watch URLs', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts id from youtu.be short links', () => {
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts id from /shorts/ URLs', () => {
    expect(extractVideoId('https://www.youtube.com/shorts/abc123XYZ')).toBe('abc123XYZ');
  });

  it('returns null for non-YouTube or invalid input', () => {
    expect(extractVideoId('https://example.com/watch?v=nope')).toBeNull();
    expect(extractVideoId('not a url')).toBeNull();
  });
});

describe('getTrackName', () => {
  it('prefers simpleText, then runs, then language code, then fallback', () => {
    expect(getTrackName({ baseUrl: '', name: { simpleText: 'English' } })).toBe('English');
    expect(getTrackName({ baseUrl: '', name: { runs: [{ text: 'Auto ' }, { text: 'gen' }] } })).toBe('Auto gen');
    expect(getTrackName({ baseUrl: '', languageCode: 'es' })).toBe('es');
    expect(getTrackName({ baseUrl: '' })).toBe('Subtitle');
  });
});

describe('decodeEntities', () => {
  it('decodes the supported HTML entities', () => {
    expect(decodeEntities('Tom &amp; Jerry &lt;3 &gt; &quot;x&quot; &#39;y&#39;')).toBe(
      'Tom & Jerry <3 > "x" \'y\'',
    );
  });
});

describe('parseJson3Captions', () => {
  it('joins segs, computes timings, and drops empty cues', () => {
    const data = {
      events: [
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Hello ' }, { utf8: 'world' }] },
        { tStartMs: 5000, segs: [{ utf8: '   ' }] },
        { tStartMs: 7000, segs: [{ utf8: 'Tail' }] },
      ],
    };
    const segments = parseJson3Captions(data);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ startTime: 1, endTime: 3, text: 'Hello world' });
    // missing dDurationMs falls back to 3s
    expect(segments[1]).toEqual({ startTime: 7, endTime: 10, text: 'Tail' });
  });

  it('returns empty array when events are missing', () => {
    expect(parseJson3Captions({})).toEqual([]);
  });
});

describe('parseXmlCaptions', () => {
  it('parses start times, strips inner tags and decodes entities', () => {
    const xml =
      '<text start="1.5">Hello &amp; <b>bye</b></text>' +
      '<text start="4.0">Second</text>' +
      '<text start="6.0">   </text>';
    const segments = parseXmlCaptions(xml);
    expect(segments).toHaveLength(2);
    expect(segments[0].startTime).toBeCloseTo(1.5, 3);
    expect(segments[0].text).toBe('Hello & bye');
    expect(segments[1].text).toBe('Second');
    // empty cue filtered out
    expect(segments.every((s) => s.text.length > 0)).toBe(true);
    // end time is always after start time
    expect(segments[0].endTime).toBeGreaterThan(segments[0].startTime);
  });
});

describe('withFormat', () => {
  it('sets the fmt query parameter', () => {
    expect(withFormat('https://www.youtube.com/api/timedtext?v=1', 'json3')).toContain('fmt=json3');
    expect(withFormat('https://www.youtube.com/api/timedtext?fmt=srv1', 'srv3')).toContain('fmt=srv3');
  });
});

describe('extractBalancedJson', () => {
  it('extracts a balanced JSON object even when strings contain braces', () => {
    const html = 'var ytInitialPlayerResponse = {"a":{"b":1},"c":"}{"} ;</script>';
    const parsed = extractBalancedJson(html, 'ytInitialPlayerResponse');
    expect(parsed).toEqual({ a: { b: 1 }, c: '}{' });
  });

  it('returns null when the marker is absent', () => {
    expect(extractBalancedJson('<html></html>', 'ytInitialPlayerResponse')).toBeNull();
  });
});
