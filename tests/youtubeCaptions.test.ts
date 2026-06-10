import { describe, it, expect } from 'vitest';
import { extractVideoId } from '../utils/youtubeTranscript';

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
