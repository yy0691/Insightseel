export interface SubtitleTrack {
  label: string;
  language: string;
  kind: string;
  src?: string;
  cues?: number;
  mode?: TextTrackMode;
  isDefault?: boolean;
}

export interface VideoSource {
  url: string;
  type: string;
  provider: 'youtube' | 'vimeo' | 'html5' | 'bilibili' | 'other';
  title?: string;
  duration?: number;
  hasSubtitles?: boolean;
  subtitles?: SubtitleTrack[];
}

export interface PageVideoInfo {
  hasVideo: boolean;
  hasSubtitles: boolean;
  videos: VideoSource[];
  pageTitle: string;
  pageUrl: string;
}

export interface PluginSettings {
  apiProvider: 'gemini' | 'openai' | 'poe' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  model: string;
  language: 'en' | 'zh';
  useProxy?: boolean;
}

export interface AnalysisResult {
  type: 'summary' | 'key-moments' | 'translation' | 'chat';
  content: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  timestamp?: string;
}

export interface VideoAnalysis {
  videoUrl: string;
  videoTitle: string;
  results: Record<string, AnalysisResult>;
  processedAt?: string;
}
