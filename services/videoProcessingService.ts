import { Video, Analysis, AnalysisType, Subtitles, SubtitleSegment } from '../types';
import { parseSrt, formatTimestamp, extractFramesFromVideo } from '../utils/helpers';
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
import { analysisDB, getEffectiveSettings } from './dbService';
import { analyzeVideoMetadata, VideoMetadataProfile } from './videoMetadataService';
import { generateVisualTranscript } from './visualTranscriptService';

interface StatusUpdate {
  stage: string;
  progress: number;
}

interface SubtitleGenerationOptions {
  video: Video;
  videoHash?: string;
  prompt: string;
  sourceLanguage: string;
  onStatus?: (status: StatusUpdate) => void;
  onStreamText?: (text: string) => void;
  onPartialSubtitles?: (segments: SubtitleSegment[]) => Promise<void> | void;
}

interface SubtitleGenerationResult {
  segments: SubtitleSegment[];
  srt: string;
  fromCache: boolean;
  provider: 'cache' | 'gemini' | 'whisper' | 'visual';
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
    maxRetries: 3,
    delayMs: 2000,
    onRetry: (attempt, error) => {
      onStatus?.({ stage: `Retrying subtitle generation... (${attempt}/3)`, progress: 0 });
      console.warn('Retrying Gemini subtitle generation:', error);
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
  options: SubtitleGenerationOptions,
): Promise<SubtitleGenerationResult> {
  const { video, videoHash, onStatus, onPartialSubtitles } = options;

  onStatus?.({ stage: 'Checking cache...', progress: 5 });
  if (videoHash) {
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
  }

  onStatus?.({ stage: 'Inspecting media tracks...', progress: 8 });
  let metadata: VideoMetadataProfile | null = null;
  try {
    metadata = await analyzeVideoMetadata(video.file);
    console.log('Media profile:', {
      duration: metadata.duration,
      averageLoudness: metadata.averageLoudness.toFixed(3),
      silenceRatio: metadata.silenceRatio,
      pipeline: metadata.recommendedPipeline,
    });
  } catch (error) {
    console.warn('Failed to analyse video metadata. Continuing with default pipeline.', error);
  }

  const pipelineRecommendation = metadata?.recommendedPipeline ?? 'audio';
  let visualAttempted = false;

  const attemptVisual = async (message: string): Promise<SubtitleGenerationResult> => {
    visualAttempted = true;
    onStatus?.({ stage: message, progress: 20 });
    return await runVisualSubtitleGeneration({ ...options, metadata: resolveMetadataFallback(video, metadata) });
  };

  if (pipelineRecommendation === 'visual') {
    try {
      return await attemptVisual('Audio track appears silent. Switching to visual analysis...');
    } catch (error) {
      console.warn('Visual pipeline primary attempt failed, trying audio-based methods.', error);
      onStatus?.({ stage: 'Visual analysis failed. Falling back to audio transcription...', progress: 35 });
    }
  } else if (pipelineRecommendation === 'hybrid') {
    onStatus?.({ stage: 'Audio quality marginal. Preparing hybrid strategy...', progress: 12 });
  } else {
    onStatus?.({ stage: 'Audio track detected. Using speech pipeline...', progress: 12 });
  }

  const settings = await getEffectiveSettings();

  let whisperAvailable = false;
  try {
    whisperAvailable = await isWhisperAvailable();
  } catch {
    whisperAvailable = false;
  }

  if (settings.useWhisper && whisperAvailable) {
    try {
      return await runWhisperSubtitleGeneration(options);
    } catch (error) {
      console.warn('Preferred Whisper generation failed, falling back to Gemini:', error);
    }
  }

  try {
    return await runGeminiSubtitleGeneration(options);
  } catch (geminiError) {
    const shouldAttemptVisualFallback =
      !visualAttempted && (pipelineRecommendation !== 'audio' || !whisperAvailable);

    if (shouldAttemptVisualFallback) {
      try {
        return await attemptVisual('Audio pipeline failed. Switching to visual analysis...');
      } catch (visualError) {
        console.warn('Visual fallback after Gemini failure also failed:', visualError);
      }
    }

    if (!whisperAvailable) {
      throw geminiError instanceof Error
        ? geminiError
        : new Error('Subtitle generation failed.');
    }

    onStatus?.({ stage: 'Gemini failed. Switching to Whisper fallback...', progress: 60 });
    try {
      return await runWhisperSubtitleGeneration(options);
    } catch (whisperError) {
      console.warn('Whisper fallback failed:', whisperError);

      if (!visualAttempted) {
        onStatus?.({ stage: 'Audio services failed. Attempting visual analysis...', progress: 70 });
        return await attemptVisual('Attempting visual analysis after audio failures...');
      }

      throw whisperError instanceof Error
        ? whisperError
        : new Error('Subtitle generation failed.');
    }
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
): Promise<{ subtitlesText?: string; frames?: string[]; usedTranscript: boolean; }> {
  const { video, subtitles, onStatus } = options;

  if (subtitles && subtitles.segments.length > 0) {
    onStatus?.({ stage: 'Using transcript for analysis...', progress: 15 });
    const subtitlesText = subtitles.segments
      .map((segment) => `[${formatTimestamp(segment.startTime)}] ${segment.text}`)
      .join('\n');

    return { subtitlesText, usedTranscript: true };
  }

  onStatus?.({ stage: 'Transcript unavailable. Extracting key frames...', progress: 12 });

  const lastSubtitle = subtitles?.segments.length
    ? subtitles.segments[subtitles.segments.length - 1]
    : null;
  const duration = video.duration || lastSubtitle?.endTime || 0;
  const frameAttempts = (() => {
    if (duration > 1800) return [75, 60, 45, 30];
    if (duration > 900) return [60, 45, 32, 24];
    if (duration > 600) return [55, 40, 28, 20];
    if (duration > 300) return [48, 36, 24, 16];
    return [40, 30, 20, 12];
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
      if (totalSizeMB <= 3.5) {
        break;
      }

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
        maxRetries: 2,
        delayMs: 1500,
        onRetry: (attempt) => {
          onStatus?.({
            stage: `Retrying analysis for ${type} (${attempt}/2)...`,
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

    await analysisDB.put(analysis);
    newAnalyses.push(analysis);

    completed += 1;
    onStatus?.({
      stage: fromCache ? `Loaded ${type} analysis from cache.` : `Completed ${type} analysis.`,
      progress: Math.round((completed / typesToGenerate.length) * 90 + (usedTranscript ? 10 : 20)),
    });
  }

  return { newAnalyses, usedTranscript };
}
