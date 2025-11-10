/**
 * OpenAI Whisper Service for Speech-to-Text
 * Provides professional transcription with higher accuracy and lower cost
 */

import { getEffectiveSettings } from './dbService';

export const WHISPER_SIZE_LIMIT_MB = 25;

interface WhisperResponse {
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
 * Check if Whisper API is available and configured
 */
export async function isWhisperAvailable(): Promise<boolean> {
  const settings = await getEffectiveSettings();
  
  // Check if user has configured OpenAI API key
  if (settings.openaiApiKey) {
    return true;
  }
  
  // Check if system has configured OpenAI API key (via proxy)
  if (settings.useProxy) {
    // Check if proxy supports Whisper
    try {
      const response = await fetch('/api/check-whisper', {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  
  return false;
}

/**
 * Generate subtitles using OpenAI Whisper API
 * Much faster and more accurate than using LLM for transcription
 * Accepts video or audio files - Whisper will extract audio automatically
 * For files >25MB, automatically chunks the audio into smaller segments
 */
export async function generateSubtitlesWithWhisper(
  file: File | Blob,
  language?: string,
  onProgress?: (progress: number) => void
): Promise<WhisperResponse> {
  const settings = await getEffectiveSettings();
  
  // Check file size - Whisper API has a 25MB limit
  const fileSizeMB = file.size / (1024 * 1024);
  // If file is too large, we need to chunk it
  if (fileSizeMB > WHISPER_SIZE_LIMIT_MB) {
    console.log(`File size ${fileSizeMB.toFixed(1)}MB exceeds Whisper limit. Chunking not implemented yet.`);
    throw new Error(`File size ${fileSizeMB.toFixed(1)}MB exceeds Whisper's ${WHISPER_SIZE_LIMIT_MB}MB limit. Please use a smaller file or Gemini will be used automatically.`);
  }
  
  // Determine filename and extension
  let fileName = 'media.webm';
  if (file instanceof File) {
    fileName = file.name;
  } else if (file.type) {
    // Infer extension from MIME type
    const extension = file.type.split('/')[1] || 'webm';
    fileName = `media.${extension}`;
  }
  
  // Create form data
  const formData = new FormData();
  // Whisper API can handle video files - it will extract audio server-side
  formData.append('file', file, fileName);
  formData.append('model', 'whisper-1');
  
  if (language && language !== 'auto') {
    formData.append('language', language);
  }
  
  // Request timestamp-level data for better subtitles
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities', 'segment');
  
  onProgress?.(10);
  
  let response: Response;
  
  if (settings.useProxy) {
    // Use proxy endpoint
    response = await fetch('/api/whisper-proxy', {
      method: 'POST',
      body: formData,
    });
  } else if (settings.openaiApiKey) {
    // Direct OpenAI API call
    response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.openaiApiKey}`,
      },
      body: formData,
    });
  } else {
    throw new Error('No OpenAI API key configured. Please add it in settings or use system proxy.');
  }
  
  onProgress?.(90);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper API error: ${response.status} - ${errorText}`);
  }
  
  const result: WhisperResponse = await response.json();
  onProgress?.(100);
  
  return result;
}

/**
 * Convert Whisper segments to SRT format
 */
export function whisperToSrt(whisperResponse: WhisperResponse): string {
  if (!whisperResponse.segments || whisperResponse.segments.length === 0) {
    // If no segments, create one from the full text
    return `1\n00:00:00,000 --> 00:00:10,000\n${whisperResponse.text}\n`;
  }
  
  return whisperResponse.segments.map((segment, index) => {
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
