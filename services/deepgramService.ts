/**
 * Deepgram Speech-to-Text Service
 * Professional speech recognition with generous free tier ($200 credits)
 */

import { getEffectiveSettings } from './dbService';

interface DeepgramResponse {
  metadata: {
    transaction_key: string;
    request_id: string;
    sha256: string;
    created: string;
    duration: number;
    channels: number;
  };
  results: {
    channels: Array<{
      alternatives: Array<{
        transcript: string;
        confidence: number;
        words: Array<{
          word: string;
          start: number;
          end: number;
          confidence: number;
        }>;
      }>;
    }>;
  };
}

interface DeepgramSegment {
  start: number;
  end: number;
  text: string;
}

/**
 * Check if Deepgram API is available and configured
 */
export async function isDeepgramAvailable(): Promise<boolean> {
  const settings = await getEffectiveSettings();
  return !!settings.deepgramApiKey;
}

/**
 * Generate subtitles using Deepgram API
 * Uses Nova-2 model for best accuracy/cost balance
 */
export async function generateSubtitlesWithDeepgram(
  file: File | Blob,
  language?: string,
  onProgress?: (progress: number) => void
): Promise<DeepgramResponse> {
  const settings = await getEffectiveSettings();

  if (!settings.deepgramApiKey) {
    throw new Error('Deepgram API key not configured');
  }

  onProgress?.(10);

  console.log('[Deepgram] Transcribing with Nova-2 model...');

  // Build API URL with parameters
  const params = new URLSearchParams({
    model: 'nova-2',
    smart_format: 'true',
    punctuate: 'true',
    paragraphs: 'false',
    utterances: 'false',
  });

  // Add language if specified
  if (language && language !== 'auto') {
    params.append('language', language);
  }

  // Call Deepgram API
  const response = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${settings.deepgramApiKey}`,
      'Content-Type': file.type || 'audio/webm',
    },
    body: file,
  });

  onProgress?.(90);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Deepgram] API error:', response.status, errorText);
    throw new Error(`Deepgram API error: ${response.status} - ${errorText}`);
  }

  const result: DeepgramResponse = await response.json();
  onProgress?.(100);

  console.log('[Deepgram] Transcription complete');

  return result;
}

/**
 * Convert Deepgram response to segments
 * Groups words into ~5-second segments for better readability
 */
export function deepgramToSegments(response: DeepgramResponse): DeepgramSegment[] {
  if (!response.results.channels || response.results.channels.length === 0) {
    return [];
  }

  const words = response.results.channels[0].alternatives[0].words;
  if (!words || words.length === 0) {
    return [];
  }

  const segments: DeepgramSegment[] = [];
  const MAX_SEGMENT_DURATION = 5.0; // 5 seconds per segment
  const MAX_WORDS_PER_SEGMENT = 15; // Max words per segment

  let currentSegment: DeepgramSegment = {
    start: words[0].start,
    end: words[0].end,
    text: words[0].word,
  };

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const segmentDuration = word.end - currentSegment.start;
    const wordCount = currentSegment.text.split(' ').length;

    // Start new segment if duration or word count exceeds limit
    if (segmentDuration > MAX_SEGMENT_DURATION || wordCount >= MAX_WORDS_PER_SEGMENT) {
      segments.push(currentSegment);
      currentSegment = {
        start: word.start,
        end: word.end,
        text: word.word,
      };
    } else {
      // Add word to current segment
      currentSegment.text += ' ' + word.word;
      currentSegment.end = word.end;
    }
  }

  // Add last segment
  if (currentSegment.text) {
    segments.push(currentSegment);
  }

  return segments;
}

/**
 * Convert Deepgram response to SRT format
 */
export function deepgramToSrt(response: DeepgramResponse): string {
  const segments = deepgramToSegments(response);

  if (segments.length === 0) {
    const transcript = response.results.channels[0]?.alternatives[0]?.transcript || '';
    return `1\n00:00:00,000 --> 00:00:10,000\n${transcript}\n`;
  }

  return segments.map((segment, index) => {
    const startTime = formatTimestamp(segment.start);
    const endTime = formatTimestamp(segment.end);
    const text = segment.text.trim();

    return `${index + 1}\n${startTime} --> ${endTime}\n${text}\n`;
  }).join('\n');
}

/**
 * Format seconds to SRT timestamp (HH:MM:SS,mmm)
 */
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}
