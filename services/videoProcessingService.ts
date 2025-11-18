import { Video, Analysis, AnalysisType, Subtitles, SubtitleSegment } from '../types';
import { parseSrt, formatTimestamp, extractFramesFromVideo, segmentsToSrt } from '../utils/helpers';
import {
  cacheSubtitles,
  cacheSubtitleProgress,
  getCachedSubtitles,
  cacheAnalysis,
  getCachedAnalysis,
  SubtitleCacheStatus,
} from './cacheService';
import {
  retryWithBackoff,
  IncrementalSaver,
} from './resilientService';
import {
  generateSubtitlesStreaming,
  analyzeVideo,
} from './geminiService';
import {
  isWhisperAvailable,
  generateSubtitlesWithWhisper,
  whisperToSrt,
} from './whisperService';
import {
  generateSubtitlesIntelligent,
  RouterResult,
} from './intelligentRouter';
import { getEffectiveSettings } from './dbService';
import { saveAnalysis } from './analysisService';
import { analyzeVideoMetadata, VideoMetadataProfile } from './videoMetadataService';
import { generateVisualTranscript } from './visualTranscriptService';
import { 
  processVideoInSegments, 
  isSegmentedProcessingAvailable 
} from './segmentedProcessor';

interface StatusUpdate {
  stage: string;
  progress: number;
}

interface SubtitleGenerationOptions {
  video: Video;
  videoHash?: string;
  prompt: string;
  sourceLanguage: string;
  abortSignal?: AbortSignal;
  onStatus?: (status: StatusUpdate) => void;
  onStreamText?: (text: string) => void;
  onPartialSubtitles?: (segments: SubtitleSegment[]) => Promise<void> | void;
}

interface SubtitleGenerationResult {
  segments: SubtitleSegment[];
  srt: string;
  fromCache: boolean;
  provider: 'cache' | 'gemini' | 'whisper' | 'visual' | 'deepgram' | 'deepgram-chunked' | 'gemini-segmented';
}

const LANGUAGE_CODE_MAP: Record<string, string> = {
  English: 'en',
  Chinese: 'zh',
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Japanese: 'ja',
  Korean: 'ko',
  Russian: 'ru',
};

function normalizeSubtitleSegments(segments: SubtitleSegment[]): SubtitleSegment[] {
  if (segments.length === 0) {
    return segments;
  }

  const normalized: SubtitleSegment[] = [];
  let lastEnd = Math.max(0, segments[0].startTime);

  for (const segment of segments) {
    const sanitizedText = segment.text.replace(/\s+/g, ' ').trim();
    const safeStart = Math.max(segment.startTime, normalized.length > 0 ? normalized[normalized.length - 1].endTime : 0);
    const minEnd = safeStart + 0.1;
    const safeEnd = Math.max(segment.endTime, minEnd);

    normalized.push({
      startTime: Number.isFinite(safeStart) ? safeStart : lastEnd,
      endTime: Number.isFinite(safeEnd) ? safeEnd : minEnd,
      text: sanitizedText,
    });

    lastEnd = normalized[normalized.length - 1].endTime;
  }

  return normalized;
}

async function runGeminiSubtitleGeneration(
  options: SubtitleGenerationOptions,
): Promise<SubtitleGenerationResult> {
  const { video, prompt, onStatus, onStreamText, onPartialSubtitles, videoHash, sourceLanguage } = options;

  onStatus?.({ stage: 'Extracting audio from video...', progress: 0 });

  let lastPartialCount = 0;
  let lastCachedCount = 0;
  const saver = onPartialSubtitles || videoHash
    ? new IncrementalSaver(async (batches: SubtitleSegment[][]) => {
        const latest = batches[batches.length - 1];
        if (!latest) {
          return;
        }

        const newCount = latest.length;
        if (newCount <= lastCachedCount) {
          return;
        }
        lastCachedCount = newCount;

        const tasks: Promise<void>[] = [];
        const normalized = normalizeSubtitleSegments(latest);

        if (onPartialSubtitles) {
          tasks.push(Promise.resolve(onPartialSubtitles(normalized)));
        }

        if (videoHash) {
          tasks.push(
            cacheSubtitleProgress(
              videoHash,
              normalized,
              sourceLanguage,
              video.file.size,
              video.duration,
              'gemini',
            ),
          );
        }

        if (tasks.length) {
          await Promise.allSettled(tasks);
        }
      }, 1500)
    : null;

  const srtContent = await retryWithBackoff(async () => {
    return await generateSubtitlesStreaming(
      video.file,
      prompt,
      (progress, stage) => onStatus?.({ stage, progress }),
      (streamedText) => {
        onStreamText?.(streamedText);
        if (!saver) return;
        try {
          const segments = parseSrt(streamedText);
          if (segments.length > lastPartialCount) {
            lastPartialCount = segments.length;
            void saver.add(segments);
          }
        } catch {
          // Ignore parse errors for partial content
        }
      },
    );
  }, {
    maxRetries: 4,
    delayMs: 2000,
    onRetry: (attempt, error) => {
      const isOverload = error.message.toLowerCase().includes('overload') || error.message.includes('503');
      const message = isOverload
        ? `API overloaded, waiting to retry subtitle generation (${attempt}/4)...`
        : `Retrying subtitle generation (${attempt}/4)...`;

      onStatus?.({ stage: message, progress: 0 });
      console.warn(`[Retry ${attempt}/4] Subtitle generation:`, error.message);
    },
  });

  if (saver) {
    await saver.flush().catch((error) => {
      console.warn('Failed to flush incremental subtitle saver:', error);
    });
  }

  const segments = normalizeSubtitleSegments(parseSrt(srtContent));
  if (segments.length === 0) {
    throw new Error('The AI service returned content that could not be parsed as subtitles.');
  }

  if (videoHash) {
    await cacheSubtitles(
      videoHash,
      srtContent,
      sourceLanguage,
      video.file.size,
      video.duration,
      { provider: 'gemini', segmentCount: segments.length },
    );
  }

  return { segments, srt: srtContent, fromCache: false, provider: 'gemini' };
}

async function runWhisperSubtitleGeneration(
  options: SubtitleGenerationOptions,
): Promise<SubtitleGenerationResult> {
  const { video, sourceLanguage, onStatus, videoHash, onPartialSubtitles } = options;

  onStatus?.({ stage: 'Uploading audio to Whisper...', progress: 10 });

  const languageCode = LANGUAGE_CODE_MAP[sourceLanguage] ?? undefined;
  const whisperResult = await generateSubtitlesWithWhisper(
    video.file,
    languageCode,
    (progress) => onStatus?.({ stage: 'Transcribing with Whisper...', progress }),
  );

  const srtContent = whisperToSrt(whisperResult);
  const segments = normalizeSubtitleSegments(parseSrt(srtContent));

  if (segments.length === 0) {
    throw new Error('Whisper returned an empty transcription.');
  }

  if ((videoHash || onPartialSubtitles) && segments.length > 0) {
    const step = Math.max(3, Math.ceil(segments.length / 6));
    let emitted = 0;
    const counts: number[] = [];

    while (emitted < segments.length) {
      emitted = Math.min(segments.length, emitted + step);
      counts.push(emitted);
    }

    for (const count of counts) {
      const partialSegments = segments.slice(0, count);
      const tasks: Promise<void>[] = [];

      if (onPartialSubtitles) {
        tasks.push(Promise.resolve(onPartialSubtitles(partialSegments)));
      }

      if (videoHash) {
        tasks.push(
          cacheSubtitleProgress(
            videoHash,
            partialSegments,
            sourceLanguage,
            video.file.size,
            video.duration,
            'whisper',
          ),
        );
      }

      if (tasks.length) {
        await Promise.allSettled(tasks);
      }

      if (count < segments.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  if (videoHash) {
    await cacheSubtitles(
      videoHash,
      srtContent,
      sourceLanguage,
      video.file.size,
      video.duration,
      { provider: 'whisper', segmentCount: segments.length },
    );
  }

  onStatus?.({ stage: 'Finalizing subtitles...', progress: 95 });

  return { segments, srt: srtContent, fromCache: false, provider: 'whisper' };
}

function resolveMetadataFallback(video: Video, metadata?: VideoMetadataProfile | null): VideoMetadataProfile {
  if (metadata) {
    return metadata;
  }

  return {
    duration: video.duration || 0,
    width: video.width || 0,
    height: video.height || 0,
    hasAudioTrack: false,
    averageLoudness: 0,
    peakLoudness: 0,
    silenceRatio: 1,
    recommendedPipeline: 'visual',
    sampledWindowSeconds: 0,
  };
}

async function runVisualSubtitleGeneration(
  options: SubtitleGenerationOptions & { metadata: VideoMetadataProfile },
): Promise<SubtitleGenerationResult> {
  const { video, prompt, onStatus, onPartialSubtitles, videoHash, sourceLanguage, metadata } = options;

  onStatus?.({ stage: 'Launching visual analysis pipeline...', progress: 28 });

  const { srt, segments } = await generateVisualTranscript({
    video,
    metadata,
    prompt,
    sourceLanguage,
    onStatus,
    onPartialSubtitles,
  });

  if (videoHash) {
    await cacheSubtitles(
      videoHash,
      srt,
      sourceLanguage,
      video.file.size,
      metadata.duration || video.duration,
    );
  }

  onStatus?.({ stage: 'Visual subtitles ready.', progress: 96 });

  return { segments, srt, fromCache: false, provider: 'visual' };
}

export async function generateResilientSubtitles(
  options: SubtitleGenerationOptions & { skipCache?: boolean },
): Promise<SubtitleGenerationResult> {
  const { video, videoHash, onStatus, onPartialSubtitles, skipCache = false } = options;

  onStatus?.({ stage: 'Checking cache...', progress: 5 });
  if (videoHash && !skipCache) {
    const cached = await getCachedSubtitles(videoHash, { includePartial: true });
    if (cached) {
      const status: SubtitleCacheStatus = cached.status ?? 'complete';
      const segments = normalizeSubtitleSegments(parseSrt(cached.content));

      if (segments.length > 0 && status === 'complete') {
        onStatus?.({ stage: 'Loaded subtitles from cache.', progress: 100 });
        return { segments, srt: cached.content, fromCache: true, provider: 'cache' };
      }

      if (segments.length > 0 && status === 'partial') {
        onStatus?.({ stage: 'Resuming from cached subtitle progress...', progress: 12 });
        if (onPartialSubtitles) {
          try {
            await onPartialSubtitles(segments);
          } catch (error) {
            console.warn('Failed to deliver cached subtitle progress to UI:', error);
          }
        }
      }
    }
  } else if (skipCache && videoHash) {
    console.log('[Subtitle] ⚠️ Skipping cache - regenerating subtitles');
  }

  onStatus?.({ stage: 'Inspecting media tracks...', progress: 8 });
  let metadata: VideoMetadataProfile | null = null;
  try {
    metadata = await analyzeVideoMetadata(video.file);
    console.log('[Subtitle] Media profile:', {
      duration: metadata.duration,
      averageLoudness: metadata.averageLoudness.toFixed(3),
      silenceRatio: metadata.silenceRatio,
      hasAudioTrack: metadata.hasAudioTrack,
      pipeline: metadata.recommendedPipeline,
    });
    
    // 🎯 警告：如果检测到静音但视频时长较长，可能是误判
    // 对于长视频（>30分钟），即使检测到静音也优先尝试Deepgram
    if (metadata.silenceRatio >= 0.75 && metadata.duration > 1800) {
      console.warn('[Subtitle] ⚠️ High silence ratio detected but video is long. May be false positive. Will still try Deepgram first.');
    }
  } catch (error) {
    console.warn('Failed to analyse video metadata. Continuing with default pipeline.', error);
  }

  const pipelineRecommendation = metadata?.recommendedPipeline ?? 'audio';
  const hasAudioTrack = metadata?.hasAudioTrack ?? true; // Default to true if metadata unavailable
  const videoDuration = metadata?.duration || video.duration || 0;
  
  // 🎯 对于长视频（>30分钟），即使检测到静音或没有音频轨道，也强制尝试音频管道（Deepgram）
  // 因为音频检测可能误判，而Deepgram可以处理完整的音频轨道
  // 对于访谈类视频，即使检测失败也应该尝试Deepgram
  const shouldForceAudioPipeline = videoDuration > 1800; // 30分钟以上强制使用音频管道
  
  if (shouldForceAudioPipeline) {
    if (pipelineRecommendation === 'visual' || !hasAudioTrack) {
      console.log('[Subtitle] 🎯 Long video detected (>30min). Forcing audio pipeline (Deepgram) despite detection results.');
      console.log('[Subtitle] 📊 Detection results:', {
        hasAudioTrack,
        pipelineRecommendation,
        averageLoudness: metadata?.averageLoudness?.toFixed(4) || 'N/A',
        peakLoudness: metadata?.peakLoudness?.toFixed(4) || 'N/A',
        silenceRatio: metadata?.silenceRatio ? (metadata.silenceRatio * 100).toFixed(1) + '%' : 'N/A'
      });
    }
  }
  
  let visualAttempted = false;

  const attemptVisual = async (message: string): Promise<SubtitleGenerationResult> => {
    visualAttempted = true;
    onStatus?.({ stage: message, progress: 20 });
    return await runVisualSubtitleGeneration({ ...options, metadata: resolveMetadataFallback(video, metadata) });
  };

  // 🎯 优先使用音频生成字幕
  // 1. 如果是长视频（>30分钟），强制使用音频管道（即使检测失败）
  // 2. 如果有音频轨道，优先使用音频管道
  // 3. 只有在短视频且明确没有音频轨道时才使用视觉管道
  
  // 🎯 关键修复：长视频必须强制使用音频管道，无论检测结果如何
  if (shouldForceAudioPipeline) {
    // 长视频：强制使用音频管道，无论检测结果
    console.log('[Subtitle] 🎯 Long video (>30min). FORCING audio pipeline (Deepgram) regardless of detection results.');
    console.log('[Subtitle] 📊 Current detection state:', {
      hasAudioTrack,
      pipelineRecommendation,
      videoDuration: `${(videoDuration / 60).toFixed(1)} minutes`
    });
    onStatus?.({ stage: 'Long video detected. Using speech pipeline (Deepgram)...', progress: 12 });
    // 直接跳过 visual pipeline 检查，进入音频管道
  } else if (hasAudioTrack && (pipelineRecommendation !== 'audio' || shouldForceAudioPipeline)) {
    // 有音频轨道：优先使用音频管道
    if (shouldForceAudioPipeline) {
      console.log('[Subtitle] 🎯 Long video with audio track. Forcing audio pipeline (Deepgram) despite visual recommendation.');
    } else {
      console.log('[Subtitle] Audio track detected. Prioritizing audio-based transcription over visual pipeline.');
    }
    onStatus?.({ stage: 'Audio track detected. Using speech pipeline...', progress: 12 });
  } else if (pipelineRecommendation === 'visual') {
    // 只有在短视频且明确没有音频轨道时才使用视觉管道
    if (!hasAudioTrack && !shouldForceAudioPipeline) {
      console.log('[Subtitle] No audio track detected (short video). Using visual pipeline.');
      try {
        return await attemptVisual('No audio track detected. Switching to visual analysis...');
      } catch (error) {
        console.warn('Visual pipeline primary attempt failed, trying audio-based methods.', error);
        onStatus?.({ stage: 'Visual analysis failed. Falling back to audio transcription...', progress: 35 });
      }
    } else {
      console.log('[Subtitle] Audio track detected or long video. Using speech pipeline despite visual recommendation.');
      onStatus?.({ stage: 'Audio track detected. Using speech pipeline...', progress: 12 });
    }
  } else if (pipelineRecommendation === 'hybrid') {
    onStatus?.({ stage: 'Audio quality marginal. Preparing hybrid strategy...', progress: 12 });
  } else {
    onStatus?.({ stage: 'Audio track detected. Using speech pipeline...', progress: 12 });
  }

  const settings = await getEffectiveSettings();

  // Use intelligent routing for subtitle generation
  onStatus?.({ stage: 'Selecting best transcription service...', progress: 15 });

  try {
    // Check if aborted before starting
    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled by user');
    }

    const languageCode = LANGUAGE_CODE_MAP[options.sourceLanguage] ?? undefined;

    const routerResult: RouterResult = await generateSubtitlesIntelligent({
      file: video.file,
      video: video,
      language: languageCode,
      prompt: options.prompt,
      abortSignal,
      onProgress: (progress, stage) => {
        onStatus?.({ stage, progress: 15 + progress * 0.80 });
      },
      onSegmentComplete: (segmentIndex, totalSegments, segments) => {
        console.log(`[Router] Segment ${segmentIndex + 1}/${totalSegments} completed with ${segments.length} subtitles`);
        if (onPartialSubtitles) {
          const result = onPartialSubtitles(segments);
          if (result instanceof Promise) {
            result.catch(err => {
              console.warn('[Router] Failed to deliver partial subtitles:', err);
            });
          }
        }
      },
    });

    const segments = normalizeSubtitleSegments(parseSrt(routerResult.srtContent));

    if (segments.length === 0) {
      throw new Error('Intelligent router returned empty subtitles');
    }

    // Cache the result
    if (videoHash) {
      // Map router service types to cache provider types
      const cacheProvider: 'gemini' | 'whisper' | 'visual' | undefined = 
        routerResult.usedService === 'deepgram' || 
        routerResult.usedService === 'deepgram-chunked' || 
        routerResult.usedService === 'gemini-segmented'
          ? 'gemini' // Map deepgram and segmented services to gemini for cache
          : routerResult.usedService === 'gemini'
          ? 'gemini'
          : undefined;
      
      await cacheSubtitles(
        videoHash,
        routerResult.srtContent,
        options.sourceLanguage,
        video.file.size,
        video.duration,
        { provider: cacheProvider, segmentCount: segments.length },
      );
    }

    onStatus?.({
      stage: `Complete! (Used ${routerResult.usedService} in ${(routerResult.processingTimeMs / 1000).toFixed(1)}s)`,
      progress: 100
    });

    return {
      segments,
      srt: routerResult.srtContent,
      fromCache: false,
      provider: routerResult.usedService
    };
  } catch (routerError) {
    console.warn('[Router] Intelligent routing failed:', routerError);
    
    // 🎯 对于长视频，即使 intelligent routing 失败，也不应该使用 visual fallback
    // 因为长视频几乎肯定有音频，失败可能是网络或API问题，而不是真的没有音频
    if (shouldForceAudioPipeline) {
      console.error('[Router] ❌ Long video audio transcription failed. Will NOT use visual fallback.');
      console.error('[Router] 💡 This is likely a network/API issue, not missing audio. Please retry or check Deepgram API key.');
      throw new Error(
        `长视频音频转录失败。这可能是网络或API问题，而不是视频没有音频。\n\n` +
        `Long video audio transcription failed. This is likely a network/API issue, not missing audio.\n\n` +
        `建议：\n` +
        `1. 检查 Deepgram API Key 是否正确配置\n` +
        `2. 检查网络连接\n` +
        `3. 稍后重试\n\n` +
        `Suggestions:\n` +
        `1. Check if Deepgram API Key is correctly configured\n` +
        `2. Check network connection\n` +
        `3. Retry later\n\n` +
        `原始错误 / Original error: ${routerError instanceof Error ? routerError.message : String(routerError)}`
      );
    }
    
    onStatus?.({ stage: 'Intelligent routing failed. Trying visual analysis...', progress: 30 });

    const shouldAttemptVisualFallback = !visualAttempted && pipelineRecommendation !== 'audio' && !shouldForceAudioPipeline;

    if (shouldAttemptVisualFallback) {
      try {
        return await attemptVisual('All audio transcription methods failed. Switching to visual analysis...');
      } catch (visualError) {
        console.error('Visual fallback after router failure also failed:', visualError);
      }
    }

    throw routerError instanceof Error
      ? routerError
      : new Error('All subtitle generation methods failed.');
  }
}

interface InsightGenerationOptions {
  video: Video;
  videoHash?: string;
  subtitles: Subtitles | null;
  prompts: Record<Exclude<AnalysisType, 'chat'>, string>;
  existingAnalyses: Analysis[];
  onStatus?: (status: StatusUpdate) => void;
}

interface InsightGenerationResult {
  newAnalyses: Analysis[];
  usedTranscript: boolean;
}

async function prepareAnalysisPayload(
  options: InsightGenerationOptions,
): Promise<{ subtitlesText?: string; frames?: string[]; audioData?: { data: string; mimeType: string; isUrl?: boolean }; usedTranscript: boolean; }> {
  const { video, subtitles, onStatus } = options;

  if (subtitles && subtitles.segments.length > 0) {
    onStatus?.({ stage: 'Using transcript for analysis...', progress: 15 });
    const subtitlesText = subtitles.segments
      .map((segment) => `[${formatTimestamp(segment.startTime)}] ${segment.text}`)
      .join('\n');

    return { subtitlesText, usedTranscript: true };
  }

  // Check if video has audio track - prefer audio over frames for analysis
  onStatus?.({ stage: 'Checking video metadata...', progress: 10 });
  let hasAudioTrack = true; // Default to true
  try {
    const { analyzeVideoMetadata } = await import('./videoMetadataService');
    const metadata = await analyzeVideoMetadata(video.file);
    hasAudioTrack = metadata.hasAudioTrack;
    console.log('[Analysis] Video metadata:', { hasAudioTrack, recommendedPipeline: metadata.recommendedPipeline });
  } catch (error) {
    console.warn('[Analysis] Failed to analyze video metadata, assuming audio exists:', error);
  }

  // If video has audio, extract and use audio for analysis (much smaller than frames)
  if (hasAudioTrack) {
    try {
      onStatus?.({ stage: 'Extracting audio for analysis...', progress: 12 });
      const { extractAudioToBase64 } = await import('../utils/helpers');
      const audioData = await extractAudioToBase64(video.file, (progress) => {
        onStatus?.({ stage: 'Extracting audio for analysis...', progress: Math.round(12 + progress * 0.3) });
      });

      const audioSizeMB = audioData.sizeKB / 1024;
      console.log(`[Analysis] Audio extracted: ${audioData.sizeKB}KB (${audioSizeMB.toFixed(2)}MB)`);

      // Estimate request size: base64 increases size by ~33%, plus JSON overhead (~0.1MB)
      const estimatedRequestSizeMB = audioSizeMB * 1.33 + 0.1;
      const MAX_REQUEST_SIZE_MB = 4.0; // Leave 0.5MB buffer for Vercel's 4.5MB limit

      if (estimatedRequestSizeMB <= MAX_REQUEST_SIZE_MB) {
        console.log(`[Analysis] Using audio for analysis: ${audioSizeMB.toFixed(2)}MB (estimated request: ${estimatedRequestSizeMB.toFixed(2)}MB)`);
        return { audioData: { data: audioData.data, mimeType: audioData.mimeType }, usedTranscript: false };
      } else {
        // Audio too large - try uploading to object storage instead
        console.warn(`[Analysis] Audio too large (${audioSizeMB.toFixed(2)}MB, estimated request: ${estimatedRequestSizeMB.toFixed(2)}MB). Trying object storage upload...`);
        try {
          onStatus?.({ stage: 'Uploading audio to storage...', progress: 45 });
          const { uploadFileToStorageWithProgress } = await import('../utils/uploadToStorage');
          
          // Convert base64 audio to File
          const audioBlob = new Blob([Uint8Array.from(atob(audioData.data), c => c.charCodeAt(0))], { type: audioData.mimeType });
          const audioFile = new File([audioBlob], `audio-${Date.now()}.webm`, { type: audioData.mimeType });
          
          const uploadResult = await uploadFileToStorageWithProgress(audioFile, {
            onProgress: (progress) => {
              onStatus?.({ stage: 'Uploading audio to storage...', progress: Math.round(45 + progress * 0.1) });
            },
          });
          
          console.log(`[Analysis] Audio uploaded to storage: ${uploadResult.fileUrl}`);
          return { 
            audioData: { 
              data: uploadResult.fileUrl, // Use URL instead of base64
              mimeType: audioData.mimeType,
              isUrl: true, // Flag to indicate this is a URL, not base64
            }, 
            usedTranscript: false 
          };
        } catch (uploadError) {
          console.warn('[Analysis] Failed to upload audio to storage, falling back to frames:', uploadError);
          // Fall through to frame extraction
        }
      }
    } catch (error) {
      console.warn('[Analysis] Failed to extract audio, falling back to frames:', error);
      // Fall through to frame extraction
    }
  }

  // Fallback to frames if no audio or audio extraction failed
  onStatus?.({ stage: 'Transcript unavailable. Extracting key frames...', progress: 12 });

  const lastSubtitle = subtitles?.segments.length
    ? subtitles.segments[subtitles.segments.length - 1]
    : null;
  const duration = video.duration || lastSubtitle?.endTime || 0;
  const frameAttempts = (() => {
    // Increased frame counts for better analysis coverage
    if (duration > 1800) return [360, 300, 240, 180]; // 30+ min: ~1 frame per 5s
    if (duration > 1200) return [300, 240, 180, 120]; // 20-30 min: ~1 frame per 4s
    if (duration > 900) return [225, 180, 135, 90];   // 15-20 min: ~1 frame per 4s
    if (duration > 600) return [200, 150, 100, 60];   // 10-15 min: ~1 frame per 3s
    if (duration > 300) return [150, 120, 90, 60];    // 5-10 min: ~1 frame per 2s
    return [120, 90, 60, 40];                         // < 5 min: ~1 frame per 1-2s
  })();
  let frames: string[] | null = null;

  for (const maxFrames of frameAttempts) {
    try {
      frames = await extractFramesFromVideo(
        video.file,
        maxFrames,
        (progress) => onStatus?.({ stage: 'Extracting key frames from video...', progress: Math.round(10 + progress * 0.3) }),
      );

      const totalSizeMB = frames.reduce((acc, frame) => acc + frame.length, 0) / (1024 * 1024);
      console.log(`Extracted ${frames.length} frames, total size: ${totalSizeMB.toFixed(2)}MB`);

      // Estimate request size: base64 frames + JSON overhead (~0.1MB)
      // Base64 encoding adds ~33% overhead, but frames are already base64, so we just add JSON overhead
      // Keep under 3.5MB to stay under 4MB total (with JSON wrapper) for Vercel's 4.5MB limit
      const estimatedRequestSizeMB = totalSizeMB + 0.1;
      const MAX_FRAME_SIZE_MB = 3.5; // Keep frames under 3.5MB to stay under 4MB total request
      
      if (estimatedRequestSizeMB <= MAX_FRAME_SIZE_MB) {
        console.log(`Frame size OK: ${totalSizeMB.toFixed(2)}MB (estimated request: ${estimatedRequestSizeMB.toFixed(2)}MB)`);
        break;
      }

      console.warn(`Frame size (${totalSizeMB.toFixed(2)}MB, estimated request: ${estimatedRequestSizeMB.toFixed(2)}MB) exceeds ${MAX_FRAME_SIZE_MB}MB limit. Retrying with fewer frames...`);
      onStatus?.({ stage: 'Frames too large. Retrying with fewer frames...', progress: 15 });
      frames = null;
    } catch (error) {
      console.warn(`Frame extraction attempt with ${maxFrames} frames failed:`, error);
      frames = null;
    }
  }

  if (!frames || frames.length === 0) {
    throw new Error('Failed to extract frames for analysis after multiple attempts.');
  }

  return { frames, usedTranscript: false };
}

export async function generateResilientInsights(
  options: InsightGenerationOptions,
): Promise<InsightGenerationResult> {
  const { video, videoHash, prompts, existingAnalyses, onStatus } = options;

  const existingTypes = new Set(existingAnalyses.map((analysis) => analysis.type));
  const typesToGenerate = (Object.keys(prompts) as Array<Exclude<AnalysisType, 'chat'>>)
    .filter((type) => !existingTypes.has(type));

  if (typesToGenerate.length === 0) {
    return { newAnalyses: [], usedTranscript: Boolean(options.subtitles?.segments.length) };
  }

  const { usedTranscript, ...payload } = await prepareAnalysisPayload(options);

  const newAnalyses: Analysis[] = [];
  let completed = 0;

  for (const type of typesToGenerate) {
    const prompt = prompts[type];
    if (!prompt) continue;

    const cacheKey = videoHash ? await getCachedAnalysis(videoHash, type) : null;
    let resultText = cacheKey;
    let fromCache = Boolean(cacheKey);

    if (!resultText) {
      onStatus?.({
        stage: `Analyzing video (${type})...`,
        progress: Math.round((completed / typesToGenerate.length) * 70 + (usedTranscript ? 20 : 30)),
      });

      resultText = await retryWithBackoff(async () => {
        return await analyzeVideo({ ...payload, prompt });
      }, {
        maxRetries: 4,
        delayMs: 2000,
        onRetry: (attempt, error) => {
          const isOverload = error.message.toLowerCase().includes('overload') || error.message.includes('503');
          const message = isOverload
            ? `API overloaded, waiting to retry ${type} (${attempt}/4)...`
            : `Retrying analysis for ${type} (${attempt}/4)...`;

          onStatus?.({
            stage: message,
            progress: Math.round((completed / typesToGenerate.length) * 70 + 25),
          });
        },
      });

      fromCache = false;

      if (videoHash) {
        await cacheAnalysis(videoHash, type, resultText);
      }
    }

    const analysis: Analysis = {
      id: `${video.id}-${type}-${Date.now()}`,
      videoId: video.id,
      type,
      prompt,
      result: resultText,
      createdAt: new Date().toISOString(),
    };

    await saveAnalysis(analysis);
    newAnalyses.push(analysis);

    completed += 1;
    onStatus?.({
      stage: fromCache ? `Loaded ${type} analysis from cache.` : `Completed ${type} analysis.`,
      progress: Math.round((completed / typesToGenerate.length) * 90 + (usedTranscript ? 10 : 20)),
    });
  }

  return { newAnalyses, usedTranscript };
}
