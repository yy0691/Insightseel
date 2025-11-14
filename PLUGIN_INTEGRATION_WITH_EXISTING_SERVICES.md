# Plugin Integration with Existing InsightReel Services

This document explains how to integrate the browser plugin with the existing video analysis services from the main application.

## Overview

The browser plugin can leverage existing services from the main InsightReel application:

```
Browser Plugin (Client)
        ↓
   Proxy API (Bridge)
        ↓
Existing Services (Main App)
├── videoProcessingService
├── geminiService
├── translationService
├── visualTranscriptService
├── videoSplitterService
└── intelligentRouter
```

## Architecture

### Option 1: Shared Proxy API (Recommended)

The plugin communicates through a Vercel API proxy that bridges to the main application services.

**Flow:**
```
Plugin → Proxy API → Video Processing Services → AI Providers
```

**Advantages:**
- No CORS issues
- Centralized caching
- Rate limiting protection
- Video download abstraction

### Option 2: Direct Service Integration

The plugin bundles and uses services directly (larger bundle size).

```
Plugin → Direct Services → AI Providers
```

**Disadvantages:**
- Larger plugin size
- Duplicate code
- API key management complexity

## Setting Up Proxy API

### 1. Create Proxy Endpoint

Add to your Vercel API or backend:

```typescript
// api/plugin-analyze.ts (Vercel Function)

import { VercelRequest, VercelResponse } from '@vercel/node';
import { 
  generateSubtitlesIntelligent,
  generateVisualTranscript 
} from '../services/videoProcessingService';
import { translateSubtitles } from '../services/translationService';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      videoUrl, 
      analysisType, 
      provider, 
      model,
      language 
    } = req.body;

    // Validate API key
    const apiKey = req.headers['x-api-key'];
    if (apiKey && !validateApiKey(apiKey)) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Route to appropriate service
    let result: string;

    switch (analysisType) {
      case 'summary':
        result = await generateSummary(videoUrl, provider, model);
        break;
      case 'key-moments':
        result = await generateKeyMoments(videoUrl, provider, model);
        break;
      case 'translation':
        result = await generateTranslation(videoUrl, language);
        break;
      case 'chat':
        result = await generateChatResponse(videoUrl, req.body.message);
        break;
      default:
        return res.status(400).json({ error: 'Unknown analysis type' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    
    return res.status(200).json({
      success: true,
      result,
      provider,
      processingTime: Date.now()
    });

  } catch (error) {
    console.error('Plugin API error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function generateSummary(
  videoUrl: string,
  provider: string,
  model: string
): Promise<string> {
  // Use existing videoProcessingService
  const subtitles = await generateSubtitlesIntelligent({
    url: videoUrl,
    provider,
    model
  });

  // Generate summary from subtitles
  return await generateSummaryFromContent(subtitles);
}

async function generateKeyMoments(
  videoUrl: string,
  provider: string,
  model: string
): Promise<string> {
  // Extract frames and analyze
  const keyFrames = await extractKeyframes(videoUrl);
  return await analyzeForKeyMoments(keyFrames, provider, model);
}

async function generateTranslation(
  videoUrl: string,
  targetLanguage: string
): Promise<string> {
  // Use existing translationService
  return await translateVideo(videoUrl, targetLanguage);
}

async function generateChatResponse(
  videoUrl: string,
  message: string
): Promise<string> {
  // Generate response based on video content
  const context = await generateVisualTranscript(videoUrl);
  return await answerQuestion(context, message);
}
```

### 2. Video Download & Processing

Handle video downloads securely:

```typescript
// api/download-video.ts

import fetch from 'node-fetch';
import { writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as ytdl from 'ytdl-core';

export async function downloadVideo(videoUrl: string): Promise<string> {
  const tmpDir = tmpdir();
  const filename = join(tmpDir, `video-${Date.now()}.mp4`);

  // YouTube
  if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
    return await downloadYouTube(videoUrl, filename);
  }

  // Vimeo
  if (videoUrl.includes('vimeo.com')) {
    return await downloadVimeo(videoUrl, filename);
  }

  // Direct video URL
  return await downloadDirect(videoUrl, filename);
}

async function downloadYouTube(url: string, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ytdl(url, { quality: 'lowest' })
      .pipe(createWriteStream(outputPath))
      .on('finish', () => resolve(outputPath))
      .on('error', reject);
  });
}

async function downloadDirect(url: string, outputPath: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.buffer();
  await writeFile(outputPath, buffer);
  return outputPath;
}
```

## Plugin Configuration

### Plugin Settings Structure

```typescript
interface PluginSettings {
  // API Configuration
  proxyUrl: 'https://api.insightreel.app' | 'custom-url';
  apiKey?: string;
  
  // Provider Settings
  provider: 'gemini' | 'openai' | 'poe';
  model: string;
  
  // Analysis Preferences
  language: 'en' | 'zh';
  summaryLength: 'short' | 'medium' | 'long';
  
  // Feature Flags
  enableOfflineMode: boolean;
  enableCaching: boolean;
  maxCacheSize: number; // MB
}
```

### Settings Storage

```typescript
// Store in Chrome storage
chrome.storage.local.set({
  pluginSettings: {
    proxyUrl: 'https://api.insightreel.app',
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    language: 'en'
  }
});
```

## Integrating Main App Services

### 1. Video Processing Service

Import and use from main app:

```typescript
// In background worker
import { 
  generateSubtitlesIntelligent,
  RouterResult 
} from '../services/videoProcessingService';

async function processVideoInPlugin(videoUrl: string) {
  const result = await generateSubtitlesIntelligent({
    url: videoUrl,
    provider: 'gemini',
    sourceLanguage: 'en',
    onStatus: (status) => {
      console.log(`Progress: ${status.stage} ${status.progress}%`);
    }
  });

  return result;
}
```

### 2. Translation Service

```typescript
import { translateSubtitles } from '../services/translationService';

async function translateInPlugin(
  subtitles: Subtitles,
  targetLanguage: string
) {
  return await translateSubtitles(subtitles, targetLanguage);
}
```

### 3. Intelligent Router

```typescript
import { generateSubtitlesIntelligent } from '../services/intelligentRouter';

async function smartAnalysis(videoUrl: string) {
  const router = new IntelligentRouter();
  const result = await router.generateSubtitles({
    url: videoUrl,
    // System automatically routes to best provider
  });

  return result;
}
```

## Offline Mode (Future Feature)

For offline video analysis using bundled models:

```typescript
// plugin/services/offlineProcessor.ts

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { TextEncoder, TextDecoder } from 'util';

export class OfflineProcessor {
  private ffmpeg: FFmpeg;

  async init() {
    this.ffmpeg = new FFmpeg({ log: true });
    // Load WASM binary
    const response = await fetch('/wasm/ffmpeg.wasm');
    await this.ffmpeg.load();
  }

  async extractFrames(videoData: Uint8Array): Promise<string[]> {
    await this.ffmpeg.writeFile('video.mp4', videoData);
    
    await this.ffmpeg.run(
      '-i', 'video.mp4',
      '-vf', 'fps=1',
      'frame-%d.png'
    );

    // Return extracted frames
    const files = this.ffmpeg.listDir('/');
    return files.filter(f => f.startsWith('frame-'));
  }

  async transcribeWithWhisper(audioData: Uint8Array): Promise<string> {
    // Use Whisper WASM if available
    // Otherwise, fall back to server
    return await this.callWhisperAPI(audioData);
  }
}
```

## Caching Strategy

### Cache Levels

**Level 1: Browser Cache (Instant)**
```typescript
// In-memory cache
const analysisCache = new Map<string, AnalysisResult>();

function getCached(key: string): AnalysisResult | null {
  return analysisCache.get(key) || null;
}

function setCached(key: string, value: AnalysisResult) {
  analysisCache.set(key, value);
  // Clear old entries if cache exceeds size
}
```

**Level 2: IndexedDB (Fast)**
```typescript
// Persistent browser storage
async function cacheAnalysis(
  videoUrl: string,
  analysisType: string,
  result: string
) {
  const db = await openDB('insightreel-cache');
  const key = `${sha256(videoUrl)}-${analysisType}`;
  
  await db.put('analyses', {
    key,
    result,
    timestamp: Date.now()
  });
}
```

**Level 3: Server Cache (Shared)**
```
Handled by proxy API with Redis/Memcached
```

## Security Considerations

### API Key Handling

```typescript
// Never expose API keys in plugin
// Instead, use session tokens

interface SessionToken {
  token: string;
  expiresAt: number;
  permissions: string[];
}

// Request token from backend
async function getSessionToken(apiKey: string): Promise<SessionToken> {
  const response = await fetch('/api/session-token', {
    method: 'POST',
    headers: { 'X-API-Key': apiKey }
  });
  return response.json();
}

// Use token in plugin requests
chrome.runtime.sendMessage({
  action: 'analyzeVideo',
  sessionToken: token.token,
  videoUrl: url
});
```

### Content Validation

```typescript
// Validate video URLs
function isValidVideoUrl(url: string): boolean {
  const allowedDomains = [
    'youtube.com',
    'youtu.be',
    'vimeo.com',
    'example.com'
  ];

  try {
    const urlObj = new URL(url);
    return allowedDomains.some(domain => 
      urlObj.hostname.includes(domain)
    );
  } catch {
    return false;
  }
}
```

## Monitoring & Analytics

### Track Plugin Usage

```typescript
// In background worker
interface AnalyticsEvent {
  type: 'analysis_started' | 'analysis_completed' | 'error';
  videoUrl: string;
  analysisType: string;
  provider: string;
  processingTime: number;
  success: boolean;
}

async function trackEvent(event: AnalyticsEvent) {
  await fetch('/api/analytics/track', {
    method: 'POST',
    body: JSON.stringify(event)
  });
}
```

## Testing Integration

### Unit Tests

```typescript
// test/plugin.test.ts

import { test, expect } from 'vitest';
import { analyzeVideo } from '../plugin/background';

test('analyzeVideo returns summary', async () => {
  const result = await analyzeVideo({
    videoUrl: 'https://example.com/video.mp4',
    analysisType: 'summary'
  });

  expect(result).toBeDefined();
  expect(result.type).toBe('summary');
});
```

### Integration Tests

```typescript
// test/integration.test.ts

test('plugin integrates with proxy API', async () => {
  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  mockFetch.mockResolvedValue({
    ok: true,
    json: () => ({ 
      success: true, 
      result: 'Test summary' 
    })
  });

  // Simulate plugin request
  const response = await analyzeVideo({
    videoUrl: 'https://youtube.com/watch?v=test',
    analysisType: 'summary'
  });

  expect(response).toBe('Test summary');
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/analyze-video'),
    expect.any(Object)
  );
});
```

## Deployment Checklist

- [ ] Proxy API endpoints configured
- [ ] Video download handlers set up
- [ ] Caching strategy implemented
- [ ] Security validations in place
- [ ] Analytics tracking enabled
- [ ] Rate limiting configured
- [ ] Error handling robust
- [ ] Tests passing (unit + integration)
- [ ] Documentation updated
- [ ] Chrome Web Store submission ready

## Troubleshooting

### Common Integration Issues

1. **CORS Errors**
   - Ensure proxy API has correct CORS headers
   - Check plugin manifest permissions

2. **Video Download Failures**
   - Verify video URL is accessible
   - Check network permissions
   - Implement retry logic

3. **API Rate Limiting**
   - Implement exponential backoff
   - Cache results aggressively
   - Use session tokens instead of API keys

4. **Service Integration Issues**
   - Verify service versions match
   - Check environment variables
   - Review error logs in browser console

## References

- Main App Documentation: See `/` directory
- Service Documentation: See `services/` directory
- API Proxy Documentation: See `plugin/API_PROXY.md`
- Plugin Architecture: See `PLUGIN_IMPLEMENTATION_GUIDE.md`
