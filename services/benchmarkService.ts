export interface BenchmarkRecord {
  videoId: string;
  videoName: string;
  durationSeconds: number;
  fileSizeMB: number;
  provider: string;
  startedAt: number;
  completedAt: number | null;
  success: boolean;
  failureCategory?: string;
  segmentCount: number;
  coveredSeconds: number;
  peakMemoryMB: number | null;
}

export interface BenchmarkSummary {
  totalRuns: number;
  successCount: number;
  failureRate: number;
  avgProcessingTimeMs: number;
  avgCompleteness: number;
  avgPeakMemoryMB: number | null;
  providers: Record<string, number>;
  failureCategories: Record<string, number>;
}

export function computeCompleteness(coveredSeconds: number, totalDuration: number): number {
  if (totalDuration <= 0) return 0;
  return Math.min(1, coveredSeconds / totalDuration);
}

export function summarizeBenchmarks(records: BenchmarkRecord[]): BenchmarkSummary {
  if (records.length === 0) {
    return {
      totalRuns: 0,
      successCount: 0,
      failureRate: 0,
      avgProcessingTimeMs: 0,
      avgCompleteness: 0,
      avgPeakMemoryMB: null,
      providers: {},
      failureCategories: {},
    };
  }

  const successRecs = records.filter((r) => r.success && r.completedAt != null);
  const failureRecs = records.filter((r) => !r.success);

  const avgProcessingTimeMs =
    successRecs.length > 0
      ? successRecs.reduce((sum, r) => sum + (r.completedAt! - r.startedAt), 0) /
        successRecs.length
      : 0;

  const avgCompleteness =
    records.reduce((s, r) => s + computeCompleteness(r.coveredSeconds, r.durationSeconds), 0) /
    records.length;

  const memRecs = records.filter((r) => r.peakMemoryMB != null);
  const avgPeakMemoryMB =
    memRecs.length > 0
      ? memRecs.reduce((s, r) => s + r.peakMemoryMB!, 0) / memRecs.length
      : null;

  const providers: Record<string, number> = {};
  for (const r of records) providers[r.provider] = (providers[r.provider] ?? 0) + 1;

  const failureCategories: Record<string, number> = {};
  for (const r of failureRecs) {
    const cat = r.failureCategory ?? 'unknown';
    failureCategories[cat] = (failureCategories[cat] ?? 0) + 1;
  }

  return {
    totalRuns: records.length,
    successCount: successRecs.length,
    failureRate: records.length > 0 ? failureRecs.length / records.length : 0,
    avgProcessingTimeMs,
    avgCompleteness,
    avgPeakMemoryMB,
    providers,
    failureCategories,
  };
}

const STORAGE_KEY = 'insightreel:benchmarks';

export function getBenchmarkRecords(): BenchmarkRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BenchmarkRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveBenchmarkRecord(record: BenchmarkRecord): void {
  try {
    const existing = getBenchmarkRecords();
    const trimmed = [...existing, record].slice(-100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

export function exportBenchmarks(): string {
  return JSON.stringify(getBenchmarkRecords(), null, 2);
}

/** Read peak JS heap from performance.memory (Chrome-only, falls back to null). */
export function readPeakMemoryMB(): number | null {
  try {
    const mem = (performance as { memory?: { usedJSHeapSize?: number } }).memory;
    if (mem?.usedJSHeapSize) return mem.usedJSHeapSize / (1024 * 1024);
  } catch {
    // not available
  }
  return null;
}
