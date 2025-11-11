/**
 * Video Splitter Service
 * Automatically splits long videos into smaller chunks for parallel subtitle generation
 * Uses ffmpeg.wasm for client-side video processing
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

type MimeType = 'text/javascript' | 'application/wasm';

let ffmpegInstance: FFmpeg | null = null;
let isFFmpegLoaded = false;
let loadingPromise: Promise<FFmpeg> | null = null;

const DEFAULT_FFMPEG_VERSION = '0.12.9';
const DEFAULT_BASE_URLS = [
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${DEFAULT_FFMPEG_VERSION}/dist/umd`,
  `https://unpkg.com/@ffmpeg/core@${DEFAULT_FFMPEG_VERSION}/dist/umd`,
];

const DEFAULT_FETCH_TIMEOUT = 45_000;
const DEFAULT_LOAD_TIMEOUT = 120_000;

const blobUrlCache = new Map<string, string>();

function resolveConfiguredBaseUrls(): string[] {
  const raw = (import.meta as any).env?.VITE_FFMPEG_BASE_URL as string | undefined;

  const configured = raw
    ? raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

  const unique = new Set<string>();
  [...configured, ...DEFAULT_BASE_URLS].forEach((url) => {
    if (!url) {
      return;
    }

    // Normalise trailing slash to avoid duplicate requests
    const normalised = url.endsWith('/') ? url.slice(0, -1) : url;
    unique.add(normalised);
  });

  return Array.from(unique.values());
}

function getLoadTimeout(): number {
  const rawTimeout = (import.meta as any).env?.VITE_FFMPEG_LOAD_TIMEOUT_MS;
  const parsed = typeof rawTimeout === 'string' ? Number.parseInt(rawTimeout, 10) : NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LOAD_TIMEOUT;
}

function getFetchTimeout(): number {
  const rawTimeout = (import.meta as any).env?.VITE_FFMPEG_DOWNLOAD_TIMEOUT_MS;
  const parsed = typeof rawTimeout === 'string' ? Number.parseInt(rawTimeout, 10) : NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FETCH_TIMEOUT;
}

async function createBlobUrlFromSource(
  url: string,
  mimeType: MimeType,
  timeoutMs: number,
): Promise<string> {
  if (blobUrlCache.has(url)) {
    return blobUrlCache.get(url)!;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(url, {
      signal: controller?.signal,
      credentials: 'omit',
      mode: 'cors',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url} - ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);

    blobUrlCache.set(url, objectUrl);
    return objectUrl;
  } catch (error) {
    if ((error as DOMException)?.name === 'AbortError') {
      throw new Error(`Fetch timed out after ${timeoutMs}ms: ${url}`);
    }

    throw error;
  } finally {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
  }
}

function resolveAssetUrl(baseUrl: string, assetName: string): string {
  return `${baseUrl}/${assetName}`;
}

function attachEventHandlers(instance: FFmpeg, onProgress?: (progress: number) => void) {
  instance.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  instance.on('progress', ({ progress }) => {
    onProgress?.(Math.round(progress * 100));
  });
}

/**
 * Load FFmpeg instance
 */
async function loadFFmpeg(onProgress?: (progress: number) => void): Promise<FFmpeg> {
  if (ffmpegInstance && isFFmpegLoaded) {
    return ffmpegInstance;
  }

  if (loadingPromise) {
    console.log('[FFmpeg] Already loading, waiting for existing load to complete...');
    return loadingPromise;
  }

  const baseUrls = resolveConfiguredBaseUrls();
  const fetchTimeout = getFetchTimeout();

  console.log('[FFmpeg] Starting load with sources:', baseUrls);

  loadingPromise = (async () => {
    let lastError: unknown = null;

    for (const baseUrl of baseUrls) {
      try {
        const instance = new FFmpeg();
        attachEventHandlers(instance, onProgress);

        console.log(`[FFmpeg] Attempting load from ${baseUrl}`);

        const [coreURL, wasmURL, workerURL] = await Promise.all([
          createBlobUrlFromSource(resolveAssetUrl(baseUrl, 'ffmpeg-core.js'), 'text/javascript', fetchTimeout),
          createBlobUrlFromSource(resolveAssetUrl(baseUrl, 'ffmpeg-core.wasm'), 'application/wasm', fetchTimeout),
          createBlobUrlFromSource(resolveAssetUrl(baseUrl, 'ffmpeg-core.worker.js'), 'text/javascript', fetchTimeout),
        ]);

        await instance.load({
          coreURL,
          wasmURL,
          workerURL,
        });

        console.log(`[FFmpeg] Load completed successfully from ${baseUrl}`);

        ffmpegInstance = instance;
        isFFmpegLoaded = true;
        return instance;
      } catch (error) {
        lastError = error;
        console.error(`[FFmpeg] Failed to load from ${baseUrl}:`, error);
      }
    }

    throw lastError ?? new Error('Unable to load FFmpeg from any configured source');
  })();

  try {
    const instance = await loadingPromise;
    loadingPromise = null;
    return instance;
  } catch (error) {
    loadingPromise = null;
    ffmpegInstance = null;
    isFFmpegLoaded = false;
    throw error;
  }
}

export interface VideoSegmentInfo {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  blob: Blob;
  file: File;
}

/**
 * Calculate optimal segment duration based on video length
 */
export function calculateSegmentDuration(totalDuration: number): number {
  // Target ~2 minutes per segment for optimal processing
  const TARGET_SEGMENT_DURATION = 120; // 2 minutes in seconds
  
  if (totalDuration <= 180) {
    // Videos under 3 minutes: don't split
    return totalDuration;
  }
  
  if (totalDuration <= 600) {
    // 3-10 minutes: 2-minute segments
    return TARGET_SEGMENT_DURATION;
  }
  
  if (totalDuration <= 1800) {
    // 10-30 minutes: 2-minute segments
    return TARGET_SEGMENT_DURATION;
  }
  
  // Over 30 minutes: 3-minute segments to reduce number of chunks
  return 180;
}

/**
 * Split video into segments
 */
export async function splitVideoIntoSegments(
  videoFile: File,
  segmentDuration: number,
  onProgress?: (progress: number, stage: string) => void
): Promise<VideoSegmentInfo[]> {
  onProgress?.(0, 'Loading video processor...');
  
  const ffmpeg = await loadFFmpeg((loadProgress) => {
    onProgress?.(loadProgress * 0.1, 'Loading FFmpeg...');
  });

  onProgress?.(10, 'Reading video file...');
  
  // Write input file to FFmpeg virtual file system
  const inputFileName = 'input.mp4';
  await ffmpeg.writeFile(inputFileName, await fetchFile(videoFile));

  // Get video duration
  onProgress?.(15, 'Analyzing video...');
  
  // Use ffprobe to get duration (we'll use a simpler approach)
  const metadata = await getVideoMetadata(videoFile);
  const totalDuration = metadata.duration;
  
  const segments: VideoSegmentInfo[] = [];
  const numSegments = Math.ceil(totalDuration / segmentDuration);
  
  console.log(`Splitting ${totalDuration.toFixed(1)}s video into ${numSegments} segments of ~${segmentDuration}s each`);

  // Split video into segments
  for (let i = 0; i < numSegments; i++) {
    const startTime = i * segmentDuration;
    const endTime = Math.min((i + 1) * segmentDuration, totalDuration);
    const actualDuration = endTime - startTime;
    
    const outputFileName = `segment_${i}.mp4`;
    
    onProgress?.(
      15 + ((i / numSegments) * 75),
      `Splitting segment ${i + 1}/${numSegments}...`
    );

    // Use FFmpeg to extract segment
    // -ss: start time, -t: duration, -c copy: copy without re-encoding (fast)
    await ffmpeg.exec([
      '-i', inputFileName,
      '-ss', startTime.toString(),
      '-t', actualDuration.toString(),
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      outputFileName
    ]);

    // Read the output file
    const data = await ffmpeg.readFile(outputFileName);
    // Convert FileData to Blob - FFmpeg returns Uint8Array but with ArrayBufferLike
    // Use type assertion to work around strict type checking between ArrayBufferLike and ArrayBuffer
    const blob = new Blob([data as BlobPart], { type: 'video/mp4' });
    const file = new File([blob], `${videoFile.name}_segment_${i}.mp4`, { type: 'video/mp4' });

    segments.push({
      index: i,
      startTime,
      endTime,
      duration: actualDuration,
      blob,
      file,
    });

    // Clean up this segment file from FFmpeg FS
    await ffmpeg.deleteFile(outputFileName);
  }

  // Clean up input file
  await ffmpeg.deleteFile(inputFileName);

  onProgress?.(100, 'Video splitting complete!');
  
  return segments;
}

/**
 * Get video metadata (duration, dimensions)
 */
async function getVideoMetadata(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };
    
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Check if FFmpeg is available
 */
export async function isFFmpegAvailable(): Promise<boolean> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    const timeoutMs = getLoadTimeout();
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`FFmpeg load timeout after ${Math.round(timeoutMs / 1000)}s`)),
        timeoutMs,
      );
    });

    console.log('[FFmpeg] Starting availability check...');
    const loadPromise = loadFFmpeg();
    void loadPromise.catch(() => undefined);
    await Promise.race([loadPromise, timeoutPromise]);
    console.log('[FFmpeg] Successfully loaded and ready');
    return true;
  } catch (error) {
    console.error('[FFmpeg] Not available:', error);
    console.log('[FFmpeg] Falling back to standard processing (10-minute limit)');
    return false;
  } finally {
    // Ensure we clear timeout when the promise settles
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
    }
  }
}
