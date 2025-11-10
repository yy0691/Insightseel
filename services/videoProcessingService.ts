import { Video, Analysis, AnalysisType, Subtitles, SubtitleSegment } from '../types';
import { parseSrt, formatTimestamp, extractFramesFromVideo } from '../utils/helpers';
import {
  cacheSubtitles,
  getCachedSubtitles,
  cacheAnalysis,
  getCachedAnalysis,
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
  provider: 'cache' | 'gemini' | 'whisper';
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

async function runGeminiSubtitleGeneration(
  options: SubtitleGenerationOptions,
): Promise<SubtitleGenerationResult> {
  const { video, prompt, onStatus, onStreamText, onPartialSubtitles, videoHash } = options;

  onStatus?.({ stage: 'Extracting audio from video...', progress: 0 });

  let lastPartialCount = 0;
  const saver = onPartialSubtitles
    ? new IncrementalSaver(async (batches: SubtitleSegment[][]) => {
        const latest = batches[batches.length - 1];
        if (latest) {
          await onPartialSubtitles(latest);
        }
      }, 2000)
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
            saver.add(segments);
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
    await saver.flush().catch(() => {});
  }

  const segments = parseSrt(srtContent);
  if (segments.length === 0) {
    throw new Error('The AI service returned content that could not be parsed as subtitles.');
  }

  if (videoHash) {
    await cacheSubtitles(
      videoHash,
      srtContent,
      options.sourceLanguage,
      video.file.size,
      video.duration,
    );
  }

  return { segments, srt: srtContent, fromCache: false, provider: 'gemini' };
}

async function runWhisperSubtitleGeneration(
  options: SubtitleGenerationOptions,
): Promise<SubtitleGenerationResult> {
  const { video, sourceLanguage, onStatus, videoHash } = options;

  onStatus?.({ stage: 'Uploading audio to Whisper...', progress: 10 });

  const languageCode = LANGUAGE_CODE_MAP[sourceLanguage] ?? undefined;
  const whisperResult = await generateSubtitlesWithWhisper(
    video.file,
    languageCode,
    (progress) => onStatus?.({ stage: 'Transcribing with Whisper...', progress }),
  );

  const srtContent = whisperToSrt(whisperResult);
  const segments = parseSrt(srtContent);

  if (segments.length === 0) {
    throw new Error('Whisper returned an empty transcription.');
  }

  if (videoHash) {
    await cacheSubtitles(
      videoHash,
      srtContent,
      sourceLanguage,
      video.file.size,
      video.duration,
    );
  }

  onStatus?.({ stage: 'Finalizing subtitles...', progress: 95 });

  return { segments, srt: srtContent, fromCache: false, provider: 'whisper' };
}

export async function generateResilientSubtitles(
  options: SubtitleGenerationOptions,
): Promise<SubtitleGenerationResult> {
  const { video, videoHash, onStatus } = options;

  onStatus?.({ stage: 'Checking cache...', progress: 5 });
  if (videoHash) {
    const cached = await getCachedSubtitles(videoHash);
    if (cached) {
      const segments = parseSrt(cached);
      if (segments.length > 0) {
        onStatus?.({ stage: 'Loaded subtitles from cache.', progress: 100 });
        return { segments, srt: cached, fromCache: true, provider: 'cache' };
      }
    }
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
    if (!whisperAvailable) {
      throw geminiError instanceof Error
        ? geminiError
        : new Error('Subtitle generation failed.');
    }

    onStatus?.({ stage: 'Gemini failed. Switching to Whisper fallback...', progress: 60 });
    return await runWhisperSubtitleGeneration(options);
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

  onStatus?.({ stage: 'Extracting key frames from video...', progress: 10 });

  const frameAttempts = [40, 30, 20, 12];
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
