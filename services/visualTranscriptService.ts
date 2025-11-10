import { Video, SubtitleSegment } from '../types';
import { parseSrt, formatTimestamp, extractFramesFromVideo } from '../utils/helpers';
import { analyzeVideo } from './geminiService';
import { retryWithBackoff } from './resilientService';
import { VideoMetadataProfile } from './videoMetadataService';

interface VisualTranscriptOptions {
  video: Video;
  metadata: VideoMetadataProfile;
  prompt: string;
  sourceLanguage: string;
  onStatus?: (status: { stage: string; progress: number }) => void;
  onPartialSubtitles?: (segments: SubtitleSegment[]) => Promise<void> | void;
}

interface VisualTranscriptResult {
  srt: string;
  segments: SubtitleSegment[];
}

function chooseFrameBudgets(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [40, 30, 20];
  }

  if (duration <= 120) {
    return [120, 90, 60];
  }

  if (duration <= 600) {
    return [90, 70, 48];
  }

  if (duration <= 1800) {
    return [75, 60, 40];
  }

  return [60, 45, 30];
}

function buildTimelineHints(duration: number, frameCount: number): Array<{ start: number; end: number; label: string }> {
  const safeDuration = duration > 0 ? duration : frameCount;
  const interval = frameCount > 0 ? safeDuration / frameCount : safeDuration;

  const timeline: Array<{ start: number; end: number; label: string }> = [];
  for (let i = 0; i < frameCount; i++) {
    const start = Math.min(safeDuration, Math.max(0, i * interval));
    const end = i === frameCount - 1
      ? safeDuration
      : Math.min(safeDuration, (i + 1) * interval);

    timeline.push({
      start,
      end,
      label: `Frame ${i + 1}: ${formatTimestamp(start)} → ${formatTimestamp(end)}`,
    });
  }

  return timeline;
}

function cleanSrtOutput(text: string): string {
  let trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:srt)?\n([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    trimmed = fencedMatch[1].trim();
  }
  return trimmed;
}

export async function generateVisualTranscript(
  options: VisualTranscriptOptions,
): Promise<VisualTranscriptResult> {
  const { video, metadata, prompt, sourceLanguage, onStatus, onPartialSubtitles } = options;

  const frameBudgets = chooseFrameBudgets(metadata.duration || video.duration);
  let frames: string[] | null = null;
  let selectedTimeline: Array<{ start: number; end: number; label: string }> = [];

  const frameExtractionBase = 35;
  for (const frameBudget of frameBudgets) {
    onStatus?.({ stage: `Extracting visual key frames (${frameBudget})...`, progress: frameExtractionBase });
    try {
      const extracted = await extractFramesFromVideo(
        video.file,
        frameBudget,
        (progress) => {
          const mapped = Math.min(55, Math.round(frameExtractionBase + (progress * 0.2)));
          onStatus?.({ stage: `Extracting visual key frames (${frameBudget})...`, progress: mapped });
        },
      );

      if (extracted.length > 0) {
        frames = extracted;
        selectedTimeline = buildTimelineHints(metadata.duration || video.duration, extracted.length);
        break;
      }
    } catch (error) {
      console.warn(`Frame extraction attempt (${frameBudget}) failed:`, error);
    }
  }

  if (!frames || frames.length === 0) {
    throw new Error('Unable to extract frames for visual transcript generation.');
  }

  onStatus?.({ stage: 'Inferring subtitles from visual timeline...', progress: 65 });

  const timelineSummary = selectedTimeline
    .slice(0, 40)
    .map((entry) => entry.label)
    .join('\n');

  const hybridPrompt = [
    'The audio track is unavailable, so rely entirely on the provided frames to understand the video.',
    `The user request was: ${prompt}`,
    'Frames are ordered chronologically. Use the timestamp hints below to keep subtitles aligned with the timeline.',
    'Return **only** valid SRT formatted subtitles. Ensure timecodes are non-overlapping and increasing.',
    'If a frame covers a static scene, merge with adjacent frames to avoid redundant subtitles.',
    `Produce subtitles in ${sourceLanguage} if that language is supported; otherwise respond in English.`,
    'Timestamp hints for the frames:\n' + timelineSummary,
  ].join('\n\n');

  const rawSrt = await retryWithBackoff(async () => {
    return await analyzeVideo({
      frames,
      prompt: hybridPrompt,
    });
  }, {
    maxRetries: 2,
    delayMs: 1500,
    onRetry: (attempt) => {
      onStatus?.({
        stage: `Retrying visual subtitle synthesis (${attempt}/2)...`,
        progress: 72,
      });
    },
  });

  const cleanedSrt = cleanSrtOutput(rawSrt);
  const segments = parseSrt(cleanedSrt);

  if (segments.length === 0) {
    throw new Error('Visual pipeline returned content that could not be parsed as subtitles.');
  }

  // Provide partial persistence support even without streaming
  if (onPartialSubtitles) {
    try {
      await onPartialSubtitles(segments);
    } catch (error) {
      console.warn('Failed to persist partial visual subtitles:', error);
    }
  }

  onStatus?.({ stage: 'Visual subtitles ready for validation...', progress: 92 });

  return {
    srt: cleanedSrt,
    segments,
  };
}
