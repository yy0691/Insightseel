import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
  computeCompleteness,
  summarizeBenchmarks,
  getBenchmarkRecords,
  saveBenchmarkRecord,
  exportBenchmarks,
  type BenchmarkRecord,
} from '../services/benchmarkService';

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

const makeRecord = (overrides: Partial<BenchmarkRecord> = {}): BenchmarkRecord => ({
  videoId: 'vid1',
  videoName: 'test.mp4',
  durationSeconds: 300,
  fileSizeMB: 50,
  provider: 'gemini',
  startedAt: 1000,
  completedAt: 11000,
  success: true,
  segmentCount: 120,
  coveredSeconds: 300,
  peakMemoryMB: 200,
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
});

describe('computeCompleteness', () => {
  it('returns 1 when coveredSeconds equals duration', () => {
    expect(computeCompleteness(300, 300)).toBe(1);
  });

  it('returns a ratio for partial coverage', () => {
    expect(computeCompleteness(150, 300)).toBeCloseTo(0.5);
  });

  it('caps at 1 even if coveredSeconds exceeds duration', () => {
    expect(computeCompleteness(400, 300)).toBe(1);
  });

  it('returns 0 for zero duration', () => {
    expect(computeCompleteness(100, 0)).toBe(0);
  });

  it('returns 0 for negative duration', () => {
    expect(computeCompleteness(10, -5)).toBe(0);
  });
});

describe('summarizeBenchmarks', () => {
  it('returns zero-summary for empty input', () => {
    const s = summarizeBenchmarks([]);
    expect(s.totalRuns).toBe(0);
    expect(s.failureRate).toBe(0);
    expect(s.avgPeakMemoryMB).toBeNull();
  });

  it('computes correct success count and failure rate', () => {
    const records = [
      makeRecord({ success: true }),
      makeRecord({ success: false, completedAt: null, failureCategory: 'network' }),
    ];
    const s = summarizeBenchmarks(records);
    expect(s.totalRuns).toBe(2);
    expect(s.successCount).toBe(1);
    expect(s.failureRate).toBeCloseTo(0.5);
    expect(s.failureCategories).toEqual({ network: 1 });
  });

  it('computes avgProcessingTimeMs from successful records only', () => {
    const records = [
      makeRecord({ startedAt: 0, completedAt: 10000, success: true }),
      makeRecord({ startedAt: 0, completedAt: 20000, success: true }),
      makeRecord({ success: false, completedAt: null }),
    ];
    const s = summarizeBenchmarks(records);
    expect(s.avgProcessingTimeMs).toBeCloseTo(15000);
  });

  it('computes provider breakdown', () => {
    const records = [
      makeRecord({ provider: 'gemini' }),
      makeRecord({ provider: 'deepgram' }),
      makeRecord({ provider: 'deepgram' }),
    ];
    const s = summarizeBenchmarks(records);
    expect(s.providers).toEqual({ gemini: 1, deepgram: 2 });
  });

  it('computes avgCompleteness', () => {
    const records = [
      makeRecord({ coveredSeconds: 300, durationSeconds: 300 }),
      makeRecord({ coveredSeconds: 150, durationSeconds: 300 }),
    ];
    const s = summarizeBenchmarks(records);
    expect(s.avgCompleteness).toBeCloseTo(0.75);
  });

  it('omits avgPeakMemoryMB when all records have null', () => {
    const records = [makeRecord({ peakMemoryMB: null })];
    expect(summarizeBenchmarks(records).avgPeakMemoryMB).toBeNull();
  });
});

describe('localStorage persistence', () => {
  it('persists and retrieves records', () => {
    const rec = makeRecord();
    saveBenchmarkRecord(rec);
    const loaded = getBenchmarkRecords();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].videoId).toBe('vid1');
  });

  it('keeps at most 100 records (FIFO)', () => {
    for (let i = 0; i < 105; i++) {
      saveBenchmarkRecord(makeRecord({ videoId: `v${i}` }));
    }
    expect(getBenchmarkRecords()).toHaveLength(100);
  });

  it('exportBenchmarks returns valid JSON string', () => {
    saveBenchmarkRecord(makeRecord());
    const json = exportBenchmarks();
    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json)).toHaveLength(1);
  });
});
