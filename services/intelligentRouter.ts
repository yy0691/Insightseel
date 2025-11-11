/**
 * Intelligent Speech-to-Text Router
 * Automatically selects the best available service with smart fallback chain:
 * 1. Groq Whisper (fastest, free, 25MB limit)
 * 2. Deepgram (generous free tier, high quality)
 * 3. Chunked processing with Groq/Deepgram
 * 4. Gemini segmented processing (ultimate fallback)
 */

import { isGroqAvailable, generateSubtitlesWithGroq, groqToSrt, GROQ_SIZE_LIMIT_MB } from './groqService';
import { isDeepgramAvailable, generateSubtitlesWithDeepgram, deepgramToSrt } from './deepgramService';
import { generateSubtitlesStreaming } from './geminiService';
import { processVideoInSegments } from './segmentedProcessor';
import { parseSrt } from '../utils/helpers';
import { Video, SubtitleSegment } from '../types';

export interface RouterResult {
  srtContent: string;
  usedService: 'groq' | 'deepgram' | 'groq-chunked' | 'deepgram-chunked' | 'gemini' | 'gemini-segmented';
  processingTimeMs: number;
}

interface RouterOptions {
  file: File | Blob;
  video?: Video;
  language?: string;
  prompt?: string;
  onProgress?: (progress: number, stage: string) => void;
  onSegmentComplete?: (segmentIndex: number, totalSegments: number, segments: SubtitleSegment[]) => void;
}

/**
 * Main routing function - intelligently selects best service
 */
export async function generateSubtitlesIntelligent(
  options: RouterOptions
): Promise<RouterResult> {
  const { file, video, language, prompt, onProgress, onSegmentComplete } = options;
  const startTime = Date.now();
  const fileSizeMB = file.size / (1024 * 1024);

  console.log(`[Router] Starting intelligent routing for ${fileSizeMB.toFixed(1)}MB file`);

  // Check which services are available
  const groqAvailable = await isGroqAvailable();
  const deepgramAvailable = await isDeepgramAvailable();

  console.log('[Router] Available services:', {
    groq: groqAvailable,
    deepgram: deepgramAvailable,
  });

  // Strategy 1: Try Groq for files under 25MB (fastest)
  if (groqAvailable && fileSizeMB <= GROQ_SIZE_LIMIT_MB) {
    try {
      console.log('[Router] Attempting Groq Whisper (fastest option)...');
      onProgress?.(0, 'Using Groq Whisper (fastest)...');

      const result = await generateSubtitlesWithGroq(file, language, onProgress);
      const srtContent = groqToSrt(result);

      const processingTimeMs = Date.now() - startTime;
      console.log(`[Router] ✅ Groq succeeded in ${(processingTimeMs / 1000).toFixed(1)}s`);

      return {
        srtContent,
        usedService: 'groq',
        processingTimeMs,
      };
    } catch (error) {
      console.warn('[Router] Groq failed:', error);
      // Continue to next strategy
    }
  }

  // Strategy 2: Try Deepgram for files under reasonable size
  if (deepgramAvailable && fileSizeMB <= 100) {
    try {
      console.log('[Router] Attempting Deepgram (high quality)...');
      onProgress?.(0, 'Using Deepgram (high quality)...');

      const result = await generateSubtitlesWithDeepgram(file, language, onProgress);
      const srtContent = deepgramToSrt(result);

      const processingTimeMs = Date.now() - startTime;
      console.log(`[Router] ✅ Deepgram succeeded in ${(processingTimeMs / 1000).toFixed(1)}s`);

      return {
        srtContent,
        usedService: 'deepgram',
        processingTimeMs,
      };
    } catch (error) {
      console.warn('[Router] Deepgram failed:', error);
      // Continue to next strategy
    }
  }

  // Strategy 3: For files over 25MB, try chunked processing
  if (fileSizeMB > GROQ_SIZE_LIMIT_MB && video && (groqAvailable || deepgramAvailable)) {
    try {
      console.log('[Router] File too large for direct processing, attempting chunked approach...');
      onProgress?.(0, 'Splitting and processing in chunks...');

      const result = await processFileInChunks(
        file,
        video,
        language,
        groqAvailable ? 'groq' : 'deepgram',
        onProgress
      );

      const processingTimeMs = Date.now() - startTime;
      const service = groqAvailable ? 'groq-chunked' : 'deepgram-chunked';
      console.log(`[Router] ✅ Chunked processing (${service}) succeeded in ${(processingTimeMs / 1000).toFixed(1)}s`);

      return {
        srtContent: result,
        usedService: service,
        processingTimeMs,
      };
    } catch (error) {
      console.warn('[Router] Chunked processing failed:', error);
      // Continue to fallback
    }
  }

  // Strategy 4: Fallback to Gemini (single file)
  if (!video || fileSizeMB <= 50) {
    try {
      console.log('[Router] Falling back to Gemini direct processing...');
      onProgress?.(0, 'Using Gemini AI (fallback)...');

      const srtContent = await generateSubtitlesStreaming(
        file,
        prompt || 'Generate accurate subtitles with precise timestamps.',
        onProgress
      );

      const processingTimeMs = Date.now() - startTime;
      console.log(`[Router] ✅ Gemini direct succeeded in ${(processingTimeMs / 1000).toFixed(1)}s`);

      return {
        srtContent,
        usedService: 'gemini',
        processingTimeMs,
      };
    } catch (error) {
      console.warn('[Router] Gemini direct failed:', error);
      // Continue to ultimate fallback
    }
  }

  // Strategy 5: Ultimate fallback - Gemini segmented processing
  if (video) {
    try {
      console.log('[Router] Using ultimate fallback: Gemini segmented processing...');
      onProgress?.(0, 'Using Gemini segmented processing...');

      const segments = await processVideoInSegments({
        video,
        prompt: prompt || 'Generate accurate subtitles with precise timestamps.',
        sourceLanguage: language || 'auto',
        onProgress,
        onSegmentComplete,
      });

      // Convert segments to SRT
      const srtContent = segments.map((seg, index) => {
        const startTime = formatTimestamp(seg.startTime);
        const endTime = formatTimestamp(seg.endTime);
        return `${index + 1}\n${startTime} --> ${endTime}\n${seg.text}\n`;
      }).join('\n');

      const processingTimeMs = Date.now() - startTime;
      console.log(`[Router] ✅ Gemini segmented succeeded in ${(processingTimeMs / 1000).toFixed(1)}s`);

      return {
        srtContent,
        usedService: 'gemini-segmented',
        processingTimeMs,
      };
    } catch (error) {
      console.error('[Router] All strategies failed:', error);
      throw new Error('All subtitle generation methods failed. Please check your API keys and try again.');
    }
  }

  throw new Error('Unable to process file. Please provide video metadata or use a smaller file.');
}

/**
 * Process large files by chunking with FFmpeg
 */
async function processFileInChunks(
  file: File | Blob,
  video: Video,
  language: string | undefined,
  service: 'groq' | 'deepgram',
  onProgress?: (progress: number, stage: string) => void
): Promise<string> {
  const { splitVideoIntoSegments } = await import('./videoSplitterService');

  // Split into 10-minute chunks to stay under 25MB
  const segmentDuration = 600; // 10 minutes
  onProgress?.(5, 'Splitting video into chunks...');

  const segments = await splitVideoIntoSegments(
    file,
    segmentDuration,
    (splitProgress) => {
      onProgress?.(5 + splitProgress * 0.2, 'Splitting video...');
    }
  );

  console.log(`[Router] Split into ${segments.length} chunks`);

  // Process each chunk
  const results: Array<{ start: number; srt: string }> = [];
  const totalSegments = segments.length;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const progressBase = 25 + (i / totalSegments) * 70;

    onProgress?.(progressBase, `Processing chunk ${i + 1}/${totalSegments}...`);

    try {
      let srtContent: string;

      if (service === 'groq') {
        const result = await generateSubtitlesWithGroq(
          segment.file,
          language,
          (p) => onProgress?.(progressBase + (p * 0.7) / totalSegments, `Chunk ${i + 1}/${totalSegments}`)
        );
        srtContent = groqToSrt(result);
      } else {
        const result = await generateSubtitlesWithDeepgram(
          segment.file,
          language,
          (p) => onProgress?.(progressBase + (p * 0.7) / totalSegments, `Chunk ${i + 1}/${totalSegments}`)
        );
        srtContent = deepgramToSrt(result);
      }

      // Adjust timestamps
      const adjustedSrt = adjustSrtTimestamps(srtContent, segment.startTime);
      results.push({ start: segment.startTime, srt: adjustedSrt });

    } catch (error) {
      console.error(`[Router] Failed to process chunk ${i + 1}:`, error);
      throw error;
    }
  }

  // Merge all SRT results
  onProgress?.(95, 'Merging results...');
  const mergedSrt = mergeSrtFiles(results.map(r => r.srt));

  return mergedSrt;
}

/**
 * Adjust SRT timestamps by offset
 */
function adjustSrtTimestamps(srtContent: string, offsetSeconds: number): string {
  const segments = parseSrt(srtContent);

  return segments.map((seg, index) => {
    const startTime = formatTimestamp(seg.startTime + offsetSeconds);
    const endTime = formatTimestamp(seg.endTime + offsetSeconds);
    return `${index + 1}\n${startTime} --> ${endTime}\n${seg.text}\n`;
  }).join('\n');
}

/**
 * Merge multiple SRT files into one
 */
function mergeSrtFiles(srtFiles: string[]): string {
  const allSegments: SubtitleSegment[] = [];

  for (const srt of srtFiles) {
    const segments = parseSrt(srt);
    allSegments.push(...segments);
  }

  // Sort by start time
  allSegments.sort((a, b) => a.startTime - b.startTime);

  // Re-number and format
  return allSegments.map((seg, index) => {
    const startTime = formatTimestamp(seg.startTime);
    const endTime = formatTimestamp(seg.endTime);
    return `${index + 1}\n${startTime} --> ${endTime}\n${seg.text}\n`;
  }).join('\n');
}

/**
 * Format seconds to SRT timestamp
 */
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

/**
 * Get recommended service for file
 */
export async function getRecommendedService(fileSizeMB: number): Promise<string> {
  const groqAvailable = await isGroqAvailable();
  const deepgramAvailable = await isDeepgramAvailable();

  if (groqAvailable && fileSizeMB <= GROQ_SIZE_LIMIT_MB) {
    return 'Groq Whisper (fastest)';
  }

  if (deepgramAvailable && fileSizeMB <= 100) {
    return 'Deepgram (high quality)';
  }

  if (fileSizeMB > GROQ_SIZE_LIMIT_MB && (groqAvailable || deepgramAvailable)) {
    return 'Chunked processing';
  }

  return 'Gemini AI';
}
