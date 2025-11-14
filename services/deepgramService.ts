/**
 * Deepgram Speech-to-Text Service
 * Professional speech recognition with generous free tier ($200 credits)
 */

import { getEffectiveSettings } from './dbService';

// System default Deepgram API key (from environment variable)
// Users can override this in settings
const SYSTEM_DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY;

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
 * Get the Deepgram API key to use
 * Priority: User's key > System default key
 */
function getDeepgramApiKey(userKey?: string): string | undefined {
  return userKey || SYSTEM_DEEPGRAM_KEY;
}

/**
 * Check if Deepgram API is available and configured
 * Also tests the API key by making a simple validation request
 */
export async function isDeepgramAvailable(): Promise<boolean> {
  const settings = await getEffectiveSettings();
  const apiKey = getDeepgramApiKey(settings.deepgramApiKey);
  
  if (!apiKey) {
    console.log('[Deepgram] ❌ API Key not configured:', {
      hasUserKey: !!settings.deepgramApiKey,
      hasSystemKey: !!SYSTEM_DEEPGRAM_KEY,
    });
    return false;
  }

  console.log('[Deepgram] 🔍 Checking API Key availability:', {
    hasUserKey: !!settings.deepgramApiKey,
    hasSystemKey: !!SYSTEM_DEEPGRAM_KEY,
    usingKey: settings.deepgramApiKey ? 'user' : 'system',
    keyLength: apiKey.length,
    keyPrefix: apiKey.substring(0, 8) + '...'
  });

  // Test API key by making a simple validation request
  try {
    const testResponse = await fetch('https://api.deepgram.com/v1/projects', {
      method: 'GET',
      headers: {
        'Authorization': `Token ${apiKey}`,
      },
    });

    if (testResponse.ok) {
      console.log('[Deepgram] ✅ API Key is valid and working');
      return true;
    } else {
      const errorText = await testResponse.text().catch(() => 'Unknown error');
      console.warn('[Deepgram] ⚠️ API Key validation failed:', {
        status: testResponse.status,
        statusText: testResponse.statusText,
        error: errorText.substring(0, 200)
      });
      return false;
    }
  } catch (error) {
    console.warn('[Deepgram] ⚠️ Failed to validate API Key (network error, but key exists):', {
      error: error instanceof Error ? error.message : String(error)
    });
    // If network error but key exists, assume it might work (could be temporary network issue)
    // Return true to allow attempt, but log the warning
    return true;
  }
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
  const apiKey = getDeepgramApiKey(settings.deepgramApiKey);

  if (!apiKey) {
    throw new Error('Deepgram API key not configured. Please add VITE_DEEPGRAM_API_KEY to environment variables or configure in settings.');
  }

  onProgress?.(10);

  console.log('[Deepgram] Transcribing with Nova-2 model...', {
    fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
    fileType: file.type,
    language
  });

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

  // Determine content type - Deepgram accepts video files directly
  const contentType = file.type || 'video/mp4';

  console.log('[Deepgram] Sending request with:', {
    url: `https://api.deepgram.com/v1/listen?${params.toString()}`,
    contentType,
    hasAuth: !!apiKey,
    keySource: settings.deepgramApiKey ? 'user' : 'system'
  });

  // Call Deepgram API
  const response = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': contentType,
    },
    body: file,
  });

  onProgress?.(90);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Deepgram] API error:', {
      status: response.status,
      statusText: response.statusText,
      errorBody: errorText,
      headers: Object.fromEntries(response.headers.entries())
    });
    throw new Error(`Deepgram API error (${response.status}): ${errorText || response.statusText}`);
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
