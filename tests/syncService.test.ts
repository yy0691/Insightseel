import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
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

const { upsert, supabaseMock, videoDB, subtitleDB, analysisDB, noteDB, chatDB } = vi.hoisted(() => {
  const upsertFn = vi.fn().mockResolvedValue({ error: null });
  return {
    upsert: upsertFn,
    supabaseMock: { from: vi.fn(() => ({ upsert: upsertFn })) },
    videoDB: { getAll: vi.fn(), get: vi.fn() },
    subtitleDB: { get: vi.fn() },
    analysisDB: { getByVideoId: vi.fn() },
    noteDB: { get: vi.fn() },
    chatDB: { get: vi.fn() },
  };
});

vi.mock('../services/authService', () => ({ supabase: supabaseMock }));
vi.mock('../services/dbService', () => ({ videoDB, subtitleDB, analysisDB, noteDB, chatDB }));

import { syncService, syncToCloud } from '../services/syncService';

describe('syncToCloud (configured)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    upsert.mockResolvedValue({ error: null });
    videoDB.getAll.mockResolvedValue([
      { id: 'v1', name: 'A', duration: 10, size: 100, hash: 'h', folderPath: '/', language: 'en' },
    ]);
    subtitleDB.get.mockResolvedValue({
      id: 'v1',
      videoId: 'v1',
      segments: [{ startTime: 0, endTime: 1, text: 'hi' }],
    });
    analysisDB.getByVideoId.mockResolvedValue([]);
    noteDB.get.mockResolvedValue(undefined);
    chatDB.get.mockResolvedValue(undefined);
  });

  it('syncs video metadata and subtitles, and records the last sync time', async () => {
    const result = await syncToCloud('user-1');
    expect(result.success).toBe(true);
    expect(result.synced.videos).toBe(1);
    expect(result.synced.subtitles).toBe(1);
    expect(supabaseMock.from).toHaveBeenCalledWith('video_metadata');
    expect(supabaseMock.from).toHaveBeenCalledWith('subtitles');
    expect(syncService.getLastSyncTime()).not.toBeNull();
  });

  it('reports failure when a metadata upsert errors', async () => {
    upsert.mockResolvedValueOnce({ error: { message: 'boom' } });
    const result = await syncToCloud('user-1');
    // video upsert failed -> the video is skipped, nothing counted
    expect(result.synced.videos).toBe(0);
  });
});

describe('sync time helpers', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips the last sync time through localStorage', () => {
    expect(syncService.getLastSyncTime()).toBeNull();
    syncService.setLastSyncTime();
    const stored = syncService.getLastSyncTime();
    expect(stored).not.toBeNull();
    expect(syncService.getSyncStatus()).toMatchObject({ lastSyncAt: stored, isSyncing: false });
  });
});
