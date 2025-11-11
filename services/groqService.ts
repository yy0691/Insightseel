/**
 * Groq Whisper Service
 * Ultra-fast speech-to-text using Groq's optimized Whisper inference
 * Compatible with OpenAI Whisper API format
 */

import { getEffectiveSettings } from './dbService';

export const GROQ_SIZE_LIMIT_MB = 25;

interface GroqWhisperResponse {
  text: string;
  segments?: Array<{
    id: number;
    seek: number;
    start: number;
    end: number;
    text: string;
    tokens: number[];
    temperature: number;
    avg_logprob: number;
    compression_ratio: number;
    no_speech_prob: number;
  }>;
  language?: string;
  duration?: number;
}

/**
 * Check if Groq API is available and configured
 */
export async function isGroqAvailable(): Promise<boolean> {
  const settings = await getEffectiveSettings();
  return !!settings.groqApiKey;
}

/**
 * Generate subtitles using Groq's Whisper API
 * Ultra-fast inference with OpenAI Whisper compatibility
 */
export async function generateSubtitlesWithGroq(
  file: File | Blob,
  language?: string,
  onProgress?: (progress: number) => void
): Promise<GroqWhisperResponse> {
  const settings = await getEffectiveSettings();

  if (!settings.groqApiKey) {
    throw new Error('Groq API key not configured');
  }

  // Check file size - Groq has a 25MB limit for free tier
  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB > GROQ_SIZE_LIMIT_MB) {
    throw new Error(`File size ${fileSizeMB.toFixed(1)}MB exceeds Groq's ${GROQ_SIZE_LIMIT_MB}MB limit`);
  }

  // Determine filename and extension
  let fileName = 'audio.webm';
  if (file instanceof File) {
    fileName = file.name;
  } else if (file.type) {
    const extension = file.type.split('/')[1] || 'webm';
    fileName = `audio.${extension}`;
  }

  // Create form data (OpenAI Whisper compatible)
  const formData = new FormData();
  formData.append('file', file, fileName);
  formData.append('model', 'whisper-large-v3-turbo');

  if (language && language !== 'auto') {
    formData.append('language', language);
  }

  // Request verbose format with timestamps
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'segment');

  onProgress?.(10);

  console.log('[Groq] Transcribing with whisper-large-v3-turbo...');

  // Call Groq API (OpenAI compatible endpoint)
  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.groqApiKey}`,
    },
    body: formData,
  });

  onProgress?.(90);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Groq] API error:', response.status, errorText);
    throw new Error(`Groq API error: ${response.status} - ${errorText}`);
  }

  const result: GroqWhisperResponse = await response.json();
  onProgress?.(100);

  console.log('[Groq] Transcription complete');

  return result;
}

/**
 * Convert Groq Whisper response to SRT format
 */
export function groqToSrt(response: GroqWhisperResponse): string {
  if (!response.segments || response.segments.length === 0) {
    return `1\n00:00:00,000 --> 00:00:10,000\n${response.text}\n`;
  }

  return response.segments.map((segment, index) => {
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
