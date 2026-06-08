/**
 * Segmented Parallel Processor
 * Splits long videos into segments and processes them in parallel
 * Now with REAL video splitting using FFmpeg!
 */

import { generateSubtitlesStreaming } from './geminiService';
import { parseSrt, segmentsToSrt } from '../utils/helpers';
import { SubtitleSegment, Video } from '../types';
import {
  splitVideoIntoSegments,
  calculateSegmentDuration,
  isFFmpegAvailable,
  VideoSegmentInfo,
} from './videoSplitterService';

interface SegmentResult {
  index: number;
  segments: SubtitleSegment[];
  startTime: number;
  endTime: number;
}

interface SegmentedProcessingOptions {
  video: Video;
  prompt: string;
  sourceLanguage: string;
  maxParallelTasks?: number;
  onProgress?: (progress: number, stage: string) => void;
  onSegmentComplete?: (segmentIndex: number, totalSegments: number, segments: SubtitleSegment[]) => void;
  onPartialSubtitles?: (segments: SubtitleSegment[]) => void;
}

/**
 * Process a single video segment to generate subtitles
 */
async function processSegment(
  segment: VideoSegmentInfo,
  prompt: string,
  onProgress?: (progress: number, stage: string) => void
): Promise<SegmentResult> {
  console.log(`Processing segment ${segment.index}: ${segment.startTime.toFixed(1)}s - ${segment.endTime.toFixed(1)}s`);

  const srtContent = await generateSubtitlesStreaming(segment.file, prompt, onProgress);
  const segments = parseSrt(srtContent);

  const adjustedSegments = segments.map(seg => ({
    ...seg,
    startTime: seg.startTime + segment.startTime,
    endTime: seg.endTime + segment.startTime,
  }));

  return {
    index: segment.index,
    segments: adjustedSegments,
    startTime: segment.startTime,
    endTime: segment.endTime,
  };
}

/**
 * Process a single segment with automatic retry on transient failures
 */
async function processSegmentWithRetry(
  segment: VideoSegmentInfo,
  prompt: string,
  maxRetries: number = 2,
): Promise<SegmentResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await processSegment(segment, prompt);
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      // Retry on transient errors only
      const isTransient =
        msg.includes('timeout') ||
        msg.includes('network') ||
        msg.includes('rate limit') ||
        msg.includes('503') ||
        msg.includes('502') ||
        msg.includes('overloaded') ||
        msg.includes('429');
      if (!isTransient || attempt === maxRetries) break;
      const delay = 1000 * Math.pow(2, attempt); // exponential backoff
      console.warn(`[Segmented] Segment ${segment.index} attempt ${attempt + 1} failed (${msg}), retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/**
 * Process multiple segments in parallel with concurrency control.
 * Uses Promise.allSettled so a single failed segment does NOT abort the batch.
 * Tolerates up to 30% failure rate across all segments before aborting.
 */
async function processSegmentsInParallel(
  segments: VideoSegmentInfo[],
  prompt: string,
  maxParallel: number,
  onProgress?: (progress: number, stage: string) => void,
  onSegmentComplete?: (segmentIndex: number, totalSegments: number, segments: SubtitleSegment[]) => void
): Promise<SegmentResult[]> {
  const results: SegmentResult[] = [];
  const totalSegments = segments.length;
  let completedCount = 0;
  let failedCount = 0;
  const MAX_FAILURE_RATE = 0.35; // abort if >35% of all segments fail

  for (let i = 0; i < segments.length; i += maxParallel) {
    const batch = segments.slice(i, i + maxParallel);
    const batchNumber = Math.floor(i / maxParallel) + 1;
    const totalBatches = Math.ceil(segments.length / maxParallel);

    console.log(`[Segmented] Batch ${batchNumber}/${totalBatches} — ${batch.length} segments`);
    onProgress?.(
      (completedCount / totalSegments) * 100,
      `Processing batch ${batchNumber}/${totalBatches}...`
    );

    // allSettled: one failure does not cancel sibling promises in the batch
    const settled = await Promise.allSettled(
      batch.map(seg => processSegmentWithRetry(seg, prompt, 2))
    );

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        const result = outcome.value;
        results.push(result);
        completedCount++;
        onProgress?.(
          (completedCount / totalSegments) * 100,
          `Completed ${completedCount}/${totalSegments} segments`
        );
        onSegmentComplete?.(result.index, totalSegments, result.segments);
      } else {
        failedCount++;
        console.warn(`[Segmented] Segment failed (skipping):`, outcome.reason);
      }
    }

    // Abort early only if failure rate exceeds threshold
    const processed = completedCount + failedCount;
    if (processed >= totalSegments * 0.5 && failedCount / processed > MAX_FAILURE_RATE) {
      throw new Error(
        `[Segmented] Too many segment failures (${failedCount}/${processed}). ` +
        `Aborting. Check API quota or network.`
      );
    }
  }

  if (results.length === 0) {
    throw new Error('[Segmented] All segments failed. No subtitle data could be generated.');
  }

  if (failedCount > 0) {
    console.warn(`[Segmented] Completed with partial results: ${completedCount} succeeded, ${failedCount} failed.`);
  }

  return results.sort((a, b) => a.index - b.index);
}

/**
 * Merge subtitle segments from multiple parts
 */
function mergeSubtitleSegments(results: SegmentResult[]): SubtitleSegment[] {
  const allSegments: SubtitleSegment[] = [];
  
  for (const result of results) {
    allSegments.push(...result.segments);
  }
  
  return allSegments;
}

/**
 * Process video with automatic segmentation and parallel subtitle generation
 */
export async function processVideoInSegments(
  options: SegmentedProcessingOptions
): Promise<SubtitleSegment[]> {
  const {
    video,
    prompt,
    sourceLanguage,
    maxParallelTasks = 5, // Process 5 segments at a time by default
    onProgress,
    onSegmentComplete,
    onPartialSubtitles,
  } = options;

  onProgress?.(0, 'Checking video splitting capability...');

  // Check if FFmpeg is available
  const ffmpegAvailable = await isFFmpegAvailable();
  
  if (!ffmpegAvailable) {
    const fileSizeMB = video.file.size / (1024 * 1024);
    if (fileSizeMB > 50) {
      // Sending a large file to Gemini directly would always fail — fail fast with a useful message
      throw new Error(
        `FFmpeg is required to split videos larger than 50MB for Gemini processing ` +
        `(file: ${fileSizeMB.toFixed(0)}MB). ` +
        `Configure VITE_FFMPEG_BASE_URL to enable FFmpeg, or configure a Deepgram API key for direct large-file transcription.`
      );
    }
    // Small files: try Gemini direct
    console.warn('[Segmented] FFmpeg not available. File is small enough for Gemini direct processing.');
    onProgress?.(5, 'Processing video without splitting...');
    const srtContent = await generateSubtitlesStreaming(
      video.file,
      prompt,
      (p, stage) => onProgress?.(5 + p * 0.95, stage)
    );
    return parseSrt(srtContent);
  }

  // Calculate optimal segment duration
  const segmentDuration = calculateSegmentDuration(video.duration);
  const numSegments = Math.ceil(video.duration / segmentDuration);

  console.log(`Video: ${video.duration.toFixed(1)}s, will split into ${numSegments} segments of ~${segmentDuration}s each`);

  // If video is short, don't split
  if (numSegments === 1) {
    onProgress?.(5, 'Video is short, processing without splitting...');
    const srtContent = await generateSubtitlesStreaming(
      video.file,
      prompt,
      (p, stage) => onProgress?.(5 + p * 0.95, stage)
    );
    return parseSrt(srtContent);
  }

  // Split video into segments
  onProgress?.(5, 'Splitting video into segments...');
  
  const segments = await splitVideoIntoSegments(
    video.file,
    segmentDuration,
    (splitProgress, stage) => {
      onProgress?.(5 + splitProgress * 0.25, stage); // 5-30% for splitting
    }
  );

  console.log(`Successfully split video into ${segments.length} segments`);

  // Process segments in parallel
  onProgress?.(30, 'Starting parallel subtitle generation...');
  
  // Accumulate completed results for incremental partial saves
  const completedSoFar: SegmentResult[] = [];

  const results = await processSegmentsInParallel(
    segments,
    prompt,
    maxParallelTasks,
    (processProgress, stage) => {
      onProgress?.(30 + processProgress * 0.65, stage); // 30-95% for processing
    },
    (segmentIndex, totalSegments, segmentSubtitles) => {
      onSegmentComplete?.(segmentIndex, totalSegments, segmentSubtitles);

      if (onPartialSubtitles) {
        // Push the new segment into our local accumulator and deliver merged result
        completedSoFar.push({
          index: segmentIndex,
          segments: segmentSubtitles,
          startTime: segmentSubtitles[0]?.startTime ?? 0,
          endTime: segmentSubtitles[segmentSubtitles.length - 1]?.endTime ?? 0,
        });
        const sorted = [...completedSoFar].sort((a, b) => a.index - b.index);
        onPartialSubtitles(mergeSubtitleSegments(sorted));
      }
    }
  );

  // Merge all segments
  onProgress?.(95, 'Merging subtitle segments...');
  const finalSegments = mergeSubtitleSegments(results);

  onProgress?.(100, 'Complete!');
  
  return finalSegments;
}

/**
 * Estimate processing time based on video duration and method
 */
export function estimateProcessingTime(
  durationSeconds: number,
  useSegments: boolean,
  maxParallelTasks: number = 5
): number {
  const baseTimePerSecond = 0.5; // Gemini processing time per second
  
  if (!useSegments) {
    return Math.ceil(durationSeconds * baseTimePerSecond);
  }
  
  // With parallel processing, time is reduced
  const segmentDuration = calculateSegmentDuration(durationSeconds);
  const numSegments = Math.ceil(durationSeconds / segmentDuration);
  const numBatches = Math.ceil(numSegments / maxParallelTasks);
  
  // Time = (splitting time) + (longest segment time * number of batches)
  const splittingTime = Math.ceil(durationSeconds * 0.1); // ~10% of video duration
  const processingTime = Math.ceil(segmentDuration * baseTimePerSecond * numBatches);
  
  return splittingTime + processingTime;
}

/**
 * Check if segmented processing is available
 */
export async function isSegmentedProcessingAvailable(): Promise<boolean> {
  // Allow disabling segmented processing via environment variable
  if ((import.meta as any).env?.VITE_DISABLE_SEGMENTED === 'true') {
    console.log('[Segmented] Disabled via VITE_DISABLE_SEGMENTED environment variable');
    return false;
  }
  
  return await isFFmpegAvailable();
}
