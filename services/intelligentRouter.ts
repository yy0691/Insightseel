/**
 * Intelligent Speech-to-Text Router
 * Automatically selects the best available service with smart fallback chain:
 * 1. Deepgram (generous $200 free tier, high quality, supports up to 2GB files)
 * 2. Gemini direct processing (for smaller files < 50MB)
 * 3. Gemini segmented processing (ultimate fallback)
 */

import { isDeepgramAvailable, generateSubtitlesWithDeepgram, deepgramToSrt } from './deepgramService';
import { generateSubtitlesStreaming } from './geminiService';
import { processVideoInSegments } from './segmentedProcessor';
import { parseSrt } from '../utils/helpers';
import { Video, SubtitleSegment } from '../types';

export interface RouterResult {
  srtContent: string;
  usedService: 'deepgram' | 'gemini' | 'gemini-segmented';
  processingTimeMs: number;
}

interface RouterOptions {
  file: File | Blob;
  video?: Video;
  language?: string;
  prompt?: string;
  abortSignal?: AbortSignal;
  onProgress?: (progress: number, stage: string) => void;
  onSegmentComplete?: (segmentIndex: number, totalSegments: number, segments: SubtitleSegment[]) => void;
}

/**
 * Main routing function - intelligently selects best service
 */
export async function generateSubtitlesIntelligent(
  options: RouterOptions
): Promise<RouterResult> {
  const { file, video, language, prompt, onProgress, onSegmentComplete, abortSignal } = options;
  const startTime = Date.now();
  const fileSizeMB = file.size / (1024 * 1024);

  console.log(`[Router] 🚀 Starting intelligent routing for ${fileSizeMB.toFixed(1)}MB file`);

  // Check which services are available
  console.log('[Router] 🔍 Checking available services...');
  const deepgramAvailable = await isDeepgramAvailable();

  console.log('[Router] ✅ Available services:', {
    deepgram: deepgramAvailable,
  });

  if (!deepgramAvailable) {
    console.log('[Router] ⚠️ Deepgram API Key is not available or invalid. Will use fallback services.');
  }

  // Strategy 1: Try Deepgram for files (Deepgram handles large files well)
  // Deepgram can process files up to 2GB directly via API
  const DEEPGRAM_SIZE_LIMIT_MB = 2000; // 2GB limit (Deepgram API maximum)
  
  if (deepgramAvailable && fileSizeMB <= DEEPGRAM_SIZE_LIMIT_MB) {
    try {
      console.log('[Router] 🎯 Attempting Deepgram (high quality)...');
      console.log('[Router] 📊 Deepgram request details:', {
        fileSize: `${fileSizeMB.toFixed(2)}MB`,
        language: language || 'auto',
        timestamp: new Date().toISOString()
      });
      onProgress?.(0, 'Using Deepgram (high quality)...');

      // Adapt onProgress: generateSubtitlesWithDeepgram expects (progress: number) => void
      // but RouterOptions provides (progress: number, stage: string) => void
      const adaptedOnProgress = onProgress 
        ? (progress: number) => {
            // Check abort before progress update
            if (abortSignal?.aborted) {
              throw new Error('Operation cancelled by user');
            }
            onProgress(progress, 'Transcribing with Deepgram...');
          }
        : undefined;

      const result = await generateSubtitlesWithDeepgram(file, language, adaptedOnProgress, abortSignal);
      const srtContent = deepgramToSrt(result);
      
      // 🎯 记录Deepgram返回的字幕数量
      const segments = parseSrt(srtContent);
      console.log(`[Router] ✅ Deepgram succeeded in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
      console.log(`[Router] 📝 Generated ${segments.length} subtitle segments`);

      const processingTimeMs = Date.now() - startTime;
      return {
        srtContent,
        usedService: 'deepgram',
        processingTimeMs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Router] ❌ Deepgram failed:', errorMessage);
      console.error('[Router] 📋 Full error details:', error);
      // Continue to next strategy
    }
  } else if (!deepgramAvailable) {
    console.log('[Router] ⚠️ Deepgram not available (API key not configured)');
  } else {
    console.log(`[Router] ⚠️ File too large for direct Deepgram (${fileSizeMB.toFixed(1)}MB > ${DEEPGRAM_SIZE_LIMIT_MB}MB)`);
  }

  // Strategy 2: FFmpeg chunked processing (DEPRECATED - not used anymore)
  // Deepgram can handle files up to 2GB directly, so chunking is no longer needed
  // if (fileSizeMB > DEEPGRAM_SIZE_LIMIT_MB && video && deepgramAvailable) {
  //   try {
  //     console.log('[Router] File too large for direct processing, attempting chunked approach...');
  //     onProgress?.(0, 'Splitting and processing in chunks...');
  //
  //     const result = await processFileInChunks(
  //       file,
  //       video,
  //       language,
  //       'deepgram',
  //       onProgress
  //     );
  //
  //     const processingTimeMs = Date.now() - startTime;
  //     const service = 'deepgram-chunked';
  //     console.log(`[Router] ✅ Chunked processing (${service}) succeeded in ${(processingTimeMs / 1000).toFixed(1)}s`);
  //
  //     return {
  //       srtContent: result,
  //       usedService: service,
  //       processingTimeMs,
  //     };
  //   } catch (error) {
  //     console.warn('[Router] Chunked processing failed:', error);
  //     // Continue to fallback
  //   }
  // }

  // Strategy 3: Fallback to Gemini (single file)
  if (!video || fileSizeMB <= 50) {
    try {
      console.log('[Router] Falling back to Gemini direct processing...');
      onProgress?.(0, 'Using Gemini AI (fallback)...');

      // Convert Blob to File if necessary (generateSubtitlesStreaming requires File)
      const fileToProcess = file instanceof File 
        ? file 
        : new File([file], 'video.mp4', { type: file.type || 'video/mp4' });

      const srtContent = await generateSubtitlesStreaming(
        fileToProcess,
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('[Router] Gemini direct failed:', errorMessage);
      
      // Check if it's an API key error
      if (errorMessage.includes('API Key is not configured')) {
        console.error('[Router] ❌ No API keys configured. Please configure either:');
        console.error('[Router]   1. Deepgram API Key (recommended for speech-to-text)');
        console.error('[Router]   2. Gemini API Key (for fallback)');
        console.error('[Router]   3. Enable Proxy Mode in settings');
        
        throw new Error(
          '无法生成字幕：未配置 API 密钥\n\n' +
          '请在设置中配置以下任一选项：\n' +
          '1. Deepgram API Key（推荐用于语音转文字）\n' +
          '2. Gemini API Key（备用）\n' +
          '3. 启用代理模式\n\n' +
          'Subtitle generation failed: No API keys configured\n\n' +
          'Please configure one of the following in settings:\n' +
          '1. Deepgram API Key (recommended for speech-to-text)\n' +
          '2. Gemini API Key (fallback)\n' +
          '3. Enable Proxy Mode'
        );
      }
      
      // Continue to ultimate fallback
    }
  }

  // Strategy 4: Ultimate fallback - Gemini segmented processing
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Provide helpful error message based on what failed
      if (!deepgramAvailable) {
        throw new Error(
          '所有字幕生成方法都失败了\n\n' +
          `文件大小：${fileSizeMB.toFixed(1)}MB\n\n` +
          '建议解决方案：\n' +
          '1. 配置 Deepgram API Key（推荐，支持大文件）\n' +
          '2. 配置 Gemini API Key 并使用较小的文件（< 50MB）\n' +
          '3. 启用代理模式\n' +
          '4. 使用更短的视频片段\n\n' +
          'All subtitle generation methods failed\n\n' +
          `File size: ${fileSizeMB.toFixed(1)}MB\n\n` +
          'Suggested solutions:\n' +
          '1. Configure Deepgram API Key (recommended, supports large files)\n' +
          '2. Configure Gemini API Key and use smaller files (< 50MB)\n' +
          '3. Enable Proxy Mode\n' +
          '4. Use a shorter video segment'
        );
      }
      
      throw new Error(`All subtitle generation methods failed. Please check your API keys and try again.\n\nDetails: ${errorMessage}`);
    }
  }

  // If we reach here, no strategies could be attempted
  throw new Error(
    '无法处理文件\n\n' +
    `文件大小：${fileSizeMB.toFixed(1)}MB\n` +
    `是否有视频元数据：${video ? '是' : '否'}\n\n` +
    '请尝试：\n' +
    '1. 配置 Deepgram API Key（推荐）\n' +
    '2. 使用更小的文件（< 50MB）\n' +
    '3. 提供完整的视频元数据\n\n' +
    'Unable to process file\n\n' +
    `File size: ${fileSizeMB.toFixed(1)}MB\n` +
    `Has video metadata: ${video ? 'Yes' : 'No'}\n\n` +
    'Please try:\n' +
    '1. Configure Deepgram API Key (recommended)\n' +
    '2. Use a smaller file (< 50MB)\n' +
    '3. Provide complete video metadata'
  );
}

/**
 * Process large files by chunking with FFmpeg (DEPRECATED - not used anymore)
 * Deepgram can handle files up to 2GB directly, so this function is no longer needed
 */
// async function processFileInChunks(
//   file: File | Blob,
//   video: Video,
//   language: string | undefined,
//   service: 'deepgram',
//   onProgress?: (progress: number, stage: string) => void
// ): Promise<string> {
//   const { splitVideoIntoSegments } = await import('./videoSplitterService');
//
//   // Split into 10-minute chunks
//   const segmentDuration = 600; // 10 minutes
//   onProgress?.(5, 'Splitting video into chunks...');
//
//   // Convert Blob to File if necessary (splitVideoIntoSegments requires File)
//   const fileToSplit = file instanceof File 
//     ? file 
//     : new File([file], 'video.mp4', { type: file.type || 'video/mp4' });
//
//   const segments = await splitVideoIntoSegments(
//     fileToSplit,
//     segmentDuration,
//     (splitProgress, stage) => {
//       onProgress?.(5 + splitProgress * 0.2, stage || 'Splitting video...');
//     }
//   );
//
//   console.log(`[Router] Split into ${segments.length} chunks`);
//
//   // Process each chunk
//   const results: Array<{ start: number; srt: string }> = [];
//   const totalSegments = segments.length;
//
//   for (let i = 0; i < segments.length; i++) {
//     const segment = segments[i];
//     const progressBase = 25 + (i / totalSegments) * 70;
//
//     onProgress?.(progressBase, `Processing chunk ${i + 1}/${totalSegments}...`);
//
//     try {
//       const result = await generateSubtitlesWithDeepgram(
//         segment.file,
//         language,
//         (p) => onProgress?.(progressBase + (p * 0.7) / totalSegments, `Chunk ${i + 1}/${totalSegments}`)
//       );
//       const srtContent = deepgramToSrt(result);
//
//       // Adjust timestamps
//       const adjustedSrt = adjustSrtTimestamps(srtContent, segment.startTime);
//       results.push({ start: segment.startTime, srt: adjustedSrt });
//
//     } catch (error) {
//       console.error(`[Router] Failed to process chunk ${i + 1}:`, error);
//       throw error;
//     }
//   }
//
//   // Merge all SRT results
//   onProgress?.(95, 'Merging results...');
//   const mergedSrt = mergeSrtFiles(results.map(r => r.srt));
//
//   return mergedSrt;
// }

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
  const deepgramAvailable = await isDeepgramAvailable();

  if (deepgramAvailable && fileSizeMB <= 2000) {
    return 'Deepgram (high quality, supports up to 2GB)';
  }

  if (fileSizeMB > 2000) {
    return 'File too large (max 2GB for Deepgram)';
  }

  return 'Gemini AI';
}
