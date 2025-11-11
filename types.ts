export interface Video {
  id: string;
  file: File;
  name: string;
  duration: number;
  width: number;
  height: number;
  importedAt: string;
  folderPath?: string;
}

export interface SubtitleSegment {
  startTime: number;
  endTime: number;
  text: string;
}

export interface Subtitles {
  id: string; // same as videoId
  videoId: string;
  segments: SubtitleSegment[];
}

export interface Analysis {
  id: string; // e.g., `${videoId}-${type}`
  videoId: string;
  type: AnalysisType;
  prompt: string;
  result: string;
  createdAt: string;
}

export type AnalysisType = 'summary' | 'key-info' | 'topics' | 'chat';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  image?: string; // base64 data URL
}

export interface Note {
  id: string; // same as videoId
  videoId: string;
  content: string;
  updatedAt: string;
}

export type APIProvider = 'gemini' | 'openai' | 'poe' | 'custom';

export interface APISettings {
  id: 'user-settings';
  provider: APIProvider;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  language?: 'en' | 'zh';
  useProxy?: boolean;
  openaiApiKey?: string; // For Whisper API (speech-to-text)
  useWhisper?: boolean; // Prefer Whisper for subtitle generation
  groqApiKey?: string; // For Groq Whisper (ultra-fast, free)
  deepgramApiKey?: string; // For Deepgram (generous free tier)
}

// Provider-specific configuration
export interface ProviderConfig {
  name: string;
  defaultBaseUrl: string;
  defaultModel: string;
  requiresProxy: boolean; // Whether CORS requires proxy
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsAudio: boolean;
}