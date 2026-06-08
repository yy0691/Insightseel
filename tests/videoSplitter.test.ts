import { describe, it, expect, vi } from 'vitest';

// FFmpeg pulls in browser-only code; stub it so the pure helper can be imported in node.
vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: class {} }));
vi.mock('@ffmpeg/util', () => ({ fetchFile: vi.fn() }));

import { calculateSegmentDuration } from '../services/videoSplitterService';

describe('calculateSegmentDuration', () => {
  it('does not split videos at or under 3 minutes', () => {
    expect(calculateSegmentDuration(60)).toBe(60);
    expect(calculateSegmentDuration(180)).toBe(180);
  });

  it('uses 2-minute segments for 3-30 minute videos', () => {
    expect(calculateSegmentDuration(181)).toBe(120);
    expect(calculateSegmentDuration(600)).toBe(120);
    expect(calculateSegmentDuration(1200)).toBe(120);
    expect(calculateSegmentDuration(1800)).toBe(120);
  });

  it('uses 3-minute segments for videos over 30 minutes', () => {
    expect(calculateSegmentDuration(1801)).toBe(180);
    expect(calculateSegmentDuration(3600)).toBe(180);
  });
});
