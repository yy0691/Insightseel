import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
  recordGenerationStart,
  recordSegmentComplete,
  clearGenerationProgress,
  getGenerationProgress,
} from '../services/generationProgressStore';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
  } as Storage;
}

beforeAll(() => {
  vi.stubGlobal('localStorage', createMemoryStorage());
});

const VIDEO_ID = 'test-video-abc';

beforeEach(() => {
  localStorage.clear();
});

describe('recordGenerationStart', () => {
  it('writes a progress record to localStorage', () => {
    recordGenerationStart(VIDEO_ID, 'en', 5);
    const record = getGenerationProgress(VIDEO_ID);
    expect(record).not.toBeNull();
    expect(record!.videoId).toBe(VIDEO_ID);
    expect(record!.language).toBe('en');
    expect(record!.totalSegments).toBe(5);
    expect(record!.completedSegments).toBe(0);
  });

  it('defaults totalSegments to 0 when not provided', () => {
    recordGenerationStart(VIDEO_ID, 'zh');
    const record = getGenerationProgress(VIDEO_ID);
    expect(record!.totalSegments).toBe(0);
  });
});

describe('recordSegmentComplete', () => {
  it('updates completedSegments and totalSegments', () => {
    recordGenerationStart(VIDEO_ID, 'en', 8);
    recordSegmentComplete(VIDEO_ID, 3, 8);
    const record = getGenerationProgress(VIDEO_ID);
    expect(record!.completedSegments).toBe(3);
    expect(record!.totalSegments).toBe(8);
  });

  it('is a no-op when no record exists', () => {
    expect(() => recordSegmentComplete('nonexistent', 1, 4)).not.toThrow();
    expect(getGenerationProgress('nonexistent')).toBeNull();
  });

  it('expands totalSegments if reported total is larger', () => {
    recordGenerationStart(VIDEO_ID, 'en', 3);
    recordSegmentComplete(VIDEO_ID, 2, 6);
    const record = getGenerationProgress(VIDEO_ID);
    expect(record!.totalSegments).toBe(6);
  });
});

describe('clearGenerationProgress', () => {
  it('removes the record', () => {
    recordGenerationStart(VIDEO_ID, 'en');
    clearGenerationProgress(VIDEO_ID);
    expect(getGenerationProgress(VIDEO_ID)).toBeNull();
  });

  it('is safe to call when record does not exist', () => {
    expect(() => clearGenerationProgress('ghost')).not.toThrow();
  });
});

describe('getGenerationProgress', () => {
  it('returns null for unknown videoId', () => {
    expect(getGenerationProgress('nope')).toBeNull();
  });
});
