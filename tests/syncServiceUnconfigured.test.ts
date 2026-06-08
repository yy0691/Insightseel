import { describe, it, expect, vi } from 'vitest';

// Supabase is not configured (no env vars) -> exported client is null.
vi.mock('../services/authService', () => ({ supabase: null }));
vi.mock('../services/dbService', () => ({
  videoDB: { getAll: vi.fn(), get: vi.fn() },
  subtitleDB: { get: vi.fn() },
  analysisDB: { getByVideoId: vi.fn() },
  noteDB: { get: vi.fn() },
  chatDB: { get: vi.fn() },
}));

import { syncService } from '../services/syncService';

describe('sync without Supabase configured', () => {
  it('syncToCloud fails gracefully', async () => {
    const result = await syncService.syncToCloud('user-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Supabase not configured');
  });

  it('syncFromCloud fails gracefully', async () => {
    const result = await syncService.syncFromCloud('user-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Supabase not configured');
  });

  it('deleteFromCloud returns false', async () => {
    await expect(syncService.deleteFromCloud('user-1', 'v1')).resolves.toBe(false);
  });
});
