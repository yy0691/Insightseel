export interface Video {
  id: string;
  file: File;
  name: string;
  duration: number;
  width: number;
  height: number;
  size: number; // File size in bytes
  hash?: string; // SHA-256 hash of the file
  language?: string; // Video language
  importedAt: string;
  folderPath?: string;
  order?: number; // Custom order for drag and drop sorting
}

export interface SubtitleSegment {
  startTime: number;
  endTime: number;
  text: string;
  translatedText?: string;
}

export interface Subtitles {
  id: string; // same as videoId
  videoId: string;
  segments: SubtitleSegment[];
  translatedLanguage?: string;
  translatedAt?: string;
}

export type SubtitleDisplayMode = 'original' | 'translated' | 'bilingual';

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

export interface ChatHistory {
  id: string; // same as videoId
  videoId: string;
  messages: ChatMessage[];
  updatedAt: string;
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
  deepgramApiKey?: string; // For Deepgram ($200 free credits)
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