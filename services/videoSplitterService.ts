/**
 * Video Splitter Service
 * Automatically splits long videos into smaller chunks for parallel subtitle generation
 * Uses ffmpeg.wasm for client-side video processing
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let isFFmpegLoaded = false;
let loadingPromise: Promise<FFmpeg> | null = null;

/**
 * Load FFmpeg instance
 */
async function loadFFmpeg(onProgress?: (progress: number) => void): Promise<FFmpeg> {
  if (ffmpegInstance && isFFmpegLoaded) {
    return ffmpegInstance;
  }

  // If already loading, return the existing promise
  if (loadingPromise) {
    console.log('[FFmpeg] Already loading, waiting for existing load to complete...');
    return loadingPromise;
  }

  loadingPromise = (async () => {
    ffmpegInstance = new FFmpeg();
  
  ffmpegInstance.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  ffmpegInstance.on('progress', ({ progress }) => {
    onProgress?.(Math.round(progress * 100));
  });

  const baseURL = (import.meta as any).env?.VITE_FFMPEG_BASE_URL || 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  console.log('[FFmpeg] core base URL:', baseURL);
  
  console.log('[FFmpeg] Starting load...');
  await ffmpegInstance.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  console.log('[FFmpeg] Load completed successfully');

    isFFmpegLoaded = true;
    loadingPromise = null;
    return ffmpegInstance;
  })();

  return loadingPromise;
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
  try {
    // Check if we can load FFmpeg with timeout (increased to 60s for slower machines)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('FFmpeg load timeout after 60s')), 60000);
    });
    
    console.log('[FFmpeg] Starting availability check...');
    await Promise.race([loadFFmpeg(), timeoutPromise]);
    console.log('[FFmpeg] Successfully loaded and ready');
    return true;
  } catch (error) {
    console.error('[FFmpeg] Not available:', error);
    console.log('[FFmpeg] Falling back to standard processing (10-minute limit)');
    return false;
  }
}
