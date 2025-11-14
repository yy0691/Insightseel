export interface VideoSource {
  url: string;
  type: string;
  provider: 'youtube' | 'vimeo' | 'html5' | 'other';
  title?: string;
  duration?: number;
}

export interface PageVideoInfo {
  hasVideo: boolean;
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
