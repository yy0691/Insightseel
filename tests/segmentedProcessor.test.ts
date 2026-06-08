import { describe, it, expect, vi } from 'vitest';

// Stub the heavy browser/SDK dependencies so the module can load in node.
vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: class {} }));
vi.mock('@ffmpeg/util', () => ({ fetchFile: vi.fn() }));
vi.mock('../services/geminiService', () => ({
  generateSubtitlesStreaming: vi.fn(),
}));

import { estimateProcessingTime } from '../services/segmentedProcessor';

describe('estimateProcessingTime', () => {
  it('estimates linear time for non-segmented processing', () => {
    expect(estimateProcessingTime(120, false)).toBe(60);
    expect(estimateProcessingTime(0, false)).toBe(0);
  });

  it('accounts for splitting and parallel batches when segmented', () => {
    // 600s -> 120s segments -> 5 segments -> ceil(5/3)=2 batches
    // splitting = ceil(600*0.1)=60, processing = ceil(120*0.5*2)=120
    expect(estimateProcessingTime(600, true, 3)).toBe(180);
  });

  it('is faster with more parallelism', () => {
    const serial = estimateProcessingTime(1800, true, 1);
    const parallel = estimateProcessingTime(1800, true, 5);
    expect(parallel).toBeLessThan(serial);
  });
});
