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
  
  const srtContent = await generateSubtitlesStreaming(
    segment.file,
    prompt,
    onProgress
  );

  const segments = parseSrt(srtContent);
  
  // Adjust timestamps to account for segment offset
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
 * Process multiple segments in parallel with concurrency control
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

  // Process segments in batches
  for (let i = 0; i < segments.length; i += maxParallel) {
    const batch = segments.slice(i, i + maxParallel);
    const batchNumber = Math.floor(i / maxParallel) + 1;
    const totalBatches = Math.ceil(segments.length / maxParallel);
    
    console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} segments)`);
    
    onProgress?.(
      (completedCount / totalSegments) * 100,
      `Processing batch ${batchNumber}/${totalBatches}...`
    );

    // Process batch in parallel
    const batchPromises = batch.map((segment) =>
      processSegment(
        segment,
        prompt,
        (segProgress, stage) => {
          // Individual segment progress
          console.log(`Segment ${segment.index} progress: ${segProgress}%`);
        }
      )
    );

    const batchResults = await Promise.all(batchPromises);
    
    // Add results and notify
    for (const result of batchResults) {
      results.push(result);
      completedCount++;
      
      onProgress?.(
        (completedCount / totalSegments) * 100,
        `Completed ${completedCount}/${totalSegments} segments`
      );
      
      onSegmentComplete?.(result.index, totalSegments, result.segments);
    }
  }

  // Sort results by index to ensure correct order
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
    maxParallelTasks = 3, // Process 3 segments at a time by default
    onProgress,
    onSegmentComplete,
    onPartialSubtitles,
  } = options;

  onProgress?.(0, 'Checking video splitting capability...');

  // Check if FFmpeg is available
  const ffmpegAvailable = await isFFmpegAvailable();
  
  if (!ffmpegAvailable) {
    console.warn('FFmpeg not available. Processing video as single segment.');
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
  
  const results = await processSegmentsInParallel(
    segments,
    prompt,
    maxParallelTasks,
    (processProgress, stage) => {
      onProgress?.(30 + processProgress * 0.65, stage); // 30-95% for processing
    },
    (segmentIndex, totalSegments, segmentSubtitles) => {
      onSegmentComplete?.(segmentIndex, totalSegments, segmentSubtitles);
      
      // Provide partial results as segments complete
      if (onPartialSubtitles) {
        // Merge all completed segments so far
        const completedResults = results
          .filter(r => r !== undefined)
          .sort((a, b) => a.index - b.index);
        
        if (completedResults.length > 0) {
          const partialMerged = mergeSubtitleSegments(completedResults);
          onPartialSubtitles(partialMerged);
        }
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
  maxParallelTasks: number = 3
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
