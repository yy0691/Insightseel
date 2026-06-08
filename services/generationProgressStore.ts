const KEY_PREFIX = 'insightreel:subtitleProgress:';

export interface GenerationProgress {
  videoId: string;
  language: string;
  startedAt: number;
  completedSegments: number;
  totalSegments: number;
}

export function recordGenerationStart(videoId: string, language: string, totalSegments = 0): void {
  const record: GenerationProgress = {
    videoId,
    language,
    startedAt: Date.now(),
    completedSegments: 0,
    totalSegments,
  };
  try {
    localStorage.setItem(KEY_PREFIX + videoId, JSON.stringify(record));
  } catch {
    // storage unavailable — silently ignore
  }
}

export function recordSegmentComplete(videoId: string, completed: number, total: number): void {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + videoId);
    if (!raw) return;
    const record: GenerationProgress = JSON.parse(raw);
    record.completedSegments = completed;
    record.totalSegments = Math.max(record.totalSegments, total);
    localStorage.setItem(KEY_PREFIX + videoId, JSON.stringify(record));
  } catch {
    // ignore
  }
}

export function clearGenerationProgress(videoId: string): void {
  try {
    localStorage.removeItem(KEY_PREFIX + videoId);
  } catch {
    // ignore
  }
}

export function getGenerationProgress(videoId: string): GenerationProgress | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + videoId);
    return raw ? (JSON.parse(raw) as GenerationProgress) : null;
  } catch {
    return null;
  }
}
