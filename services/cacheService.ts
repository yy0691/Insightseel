/**
 * Cache Service - Smart caching for subtitles and analyses
 * Avoids redundant API calls by caching results based on video hash
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { SubtitleSegment } from '../types';
import { segmentsToSrt } from '../utils/helpers';

export type SubtitleCacheStatus = 'partial' | 'complete';

export interface SubtitleCacheEntry {
  hash: string;
  content: string;
  language: string;
  timestamp: number;
  videoSize: number;
  videoDuration: number;
  status?: SubtitleCacheStatus;
  partialSegments?: number;
  provider?: 'gemini' | 'whisper' | 'visual';
}

interface CacheSchema extends DBSchema {
  'subtitle-cache': {
    key: string; // videoHash
    value: SubtitleCacheEntry;
  };
  'analysis-cache': {
    key: string; // videoHash-analysisType
    value: {
      hash: string;
      type: string;
      result: string;
      timestamp: number;
    };
  };
}

let db: IDBPDatabase<CacheSchema> | null = null;

async function getDB() {
  if (!db) {
    db = await openDB<CacheSchema>('insightreel-cache', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('subtitle-cache')) {
          db.createObjectStore('subtitle-cache', { keyPath: 'hash' });
        }
        if (!db.objectStoreNames.contains('analysis-cache')) {
          db.createObjectStore('analysis-cache', { keyPath: 'hash' });
        }
      },
    });
  }
  return db;
}

/**
 * Generate a hash for a video file using its content
 * Uses first 1MB + last 1MB for fast hashing of large files
 */
export async function generateVideoHash(file: File): Promise<string> {
  const chunkSize = 1024 * 1024; // 1MB
  const chunks: ArrayBuffer[] = [];
  
  // Read first 1MB
  if (file.size > chunkSize) {
    const firstChunk = await file.slice(0, chunkSize).arrayBuffer();
    chunks.push(firstChunk);
    
    // Read last 1MB
    const lastChunk = await file.slice(file.size - chunkSize, file.size).arrayBuffer();
    chunks.push(lastChunk);
  } else {
    // Small file, read entire content
    chunks.push(await file.arrayBuffer());
  }
  
  // Add file metadata to hash
  const metadata = `${file.name}-${file.size}-${file.lastModified}`;
  const encoder = new TextEncoder();
  chunks.push(encoder.encode(metadata));
  
  // Combine all chunks
  const combined = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  
  // Generate SHA-256 hash
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

/**
 * Check if subtitles are cached for this video
 */
export async function getCachedSubtitles(
  videoHash: string,
  options: { includePartial?: boolean } = {},
): Promise<SubtitleCacheEntry | null> {
  const db = await getDB();
  const cached = await db.get('subtitle-cache', videoHash);

  if (cached) {
    const status = cached.status ?? 'complete';
    if (status === 'partial' && !options.includePartial) {
      console.log('ℹ️ Cache hit contains partial subtitles - waiting for completion.');
      return null;
    }

    console.log(
      status === 'complete'
        ? '✅ Cache hit: Subtitles found for this video'
        : '✅ Cache hit: Partial subtitles available for this video',
    );
    return cached;
  }

  console.log('❌ Cache miss: Subtitles not found, will generate');
  return null;
}

/**
 * Cache subtitles for a video
 */
export async function cacheSubtitles(
  videoHash: string,
  content: string,
  language: string,
  videoSize: number,
  videoDuration: number,
  options: { provider?: 'gemini' | 'whisper' | 'visual'; segmentCount?: number } = {},
): Promise<void> {
  const db = await getDB();

  await db.put('subtitle-cache', {
    hash: videoHash,
    content,
    language,
    timestamp: Date.now(),
    videoSize,
    videoDuration,
    status: 'complete',
    partialSegments: options.segmentCount,
    provider: options.provider,
  });

  console.log('💾 Subtitles cached successfully');
}

export async function cacheSubtitleProgress(
  videoHash: string,
  segments: SubtitleSegment[],
  language: string,
  videoSize: number,
  videoDuration: number,
  provider: 'gemini' | 'whisper',
): Promise<void> {
  if (segments.length === 0) {
    return;
  }

  const db = await getDB();
  const partialSrt = segmentsToSrt(segments);

  await db.put('subtitle-cache', {
    hash: videoHash,
    content: partialSrt,
    language,
    timestamp: Date.now(),
    videoSize,
    videoDuration,
    status: 'partial',
    partialSegments: segments.length,
    provider,
  });

  console.log(`💾 Cached ${segments.length} partial subtitle segments (${provider})`);
}

/**
 * Check if analysis is cached
 */
export async function getCachedAnalysis(videoHash: string, analysisType: string): Promise<string | null> {
  const db = await getDB();
  const key = `${videoHash}-${analysisType}`;
  const cached = await db.get('analysis-cache', key);
  
  if (cached) {
    console.log(`✅ Cache hit: ${analysisType} analysis found`);
    return cached.result;
  }
  
  return null;
}

/**
 * Cache analysis result
 */
export async function cacheAnalysis(
  videoHash: string,
  analysisType: string,
  result: string
): Promise<void> {
  const db = await getDB();
  const key = `${videoHash}-${analysisType}`;
  
  await db.put('analysis-cache', {
    hash: key,
    type: analysisType,
    result,
    timestamp: Date.now(),
  });
  
  console.log(`💾 ${analysisType} analysis cached successfully`);
}

/**
 * Clear old cache entries (older than 30 days)
 */
export async function clearOldCache(): Promise<void> {
  const db = await getDB();
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  // Clear old subtitle cache
  const subtitles = await db.getAll('subtitle-cache');
  for (const entry of subtitles) {
    if (entry.timestamp < thirtyDaysAgo) {
      await db.delete('subtitle-cache', entry.hash);
    }
  }
  
  // Clear old analysis cache
  const analyses = await db.getAll('analysis-cache');
  for (const entry of analyses) {
    if (entry.timestamp < thirtyDaysAgo) {
      await db.delete('analysis-cache', entry.hash);
    }
  }
  
  console.log('🧹 Old cache entries cleared');
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  subtitles: number;
  analyses: number;
  totalSize: number;
}> {
  const db = await getDB();
  
  const subtitles = await db.getAll('subtitle-cache');
  const analyses = await db.getAll('analysis-cache');
  
  const totalSize = subtitles.reduce((acc, s) => acc + s.content.length, 0) +
                    analyses.reduce((acc, a) => acc + a.result.length, 0);
  
  return {
    subtitles: subtitles.length,
    analyses: analyses.length,
    totalSize,
  };
}
