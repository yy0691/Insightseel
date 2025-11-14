# InsightReel Plugin - API Proxy Documentation

This document describes the API endpoints that the browser plugin uses to analyze videos.

## Overview

The plugin communicates with a proxy API server that handles:
- Video analysis requests
- Provider routing (Gemini, OpenAI, Poe)
- Response caching
- Error handling and retry logic

## Base URL

```
https://api.insightreel.app
```

Or configured via environment variables in the plugin settings.

## Endpoints

### 1. Analyze Video

Submits a video URL for analysis using the specified analysis type.

**Endpoint:**
```
POST /api/analyze-video
```

**Headers:**
```
Content-Type: application/json
X-API-Key: your-api-key (optional, required if not using proxy)
```

**Request Body:**
```json
{
  "videoUrl": "https://youtube.com/watch?v=dQw4w9WgXcQ",
  "analysisType": "summary",
  "provider": "gemini",
  "model": "gemini-2.0-flash",
  "language": "en",
  "customPrompt": "Summarize the video in bullet points" (optional)
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `videoUrl` | string | Yes | URL of the video to analyze |
| `analysisType` | enum | Yes | `summary`, `key-moments`, `translation`, `chat` |
| `provider` | enum | Yes | `gemini`, `openai`, `poe` |
| `model` | string | Yes | Model name (e.g., `gemini-2.0-flash`) |
| `language` | enum | Yes | `en` (English), `zh` (Chinese) |
| `customPrompt` | string | No | Custom analysis prompt |

**Response (200 OK):**
```json
{
  "success": true,
  "result": "Generated analysis content...",
  "provider": "gemini",
  "processingTime": 2500,
  "tokens": {
    "input": 1024,
    "output": 512
  }
}
```

**Error Response (400/500):**
```json
{
  "success": false,
  "error": "API rate limit exceeded",
  "errorCode": "RATE_LIMIT",
  "retryAfter": 60
}
```

**Error Codes:**
- `INVALID_URL` - Video URL is invalid or inaccessible
- `API_KEY_INVALID` - API key is missing or invalid
- `RATE_LIMIT` - API rate limit exceeded
- `PROVIDER_ERROR` - Error from AI provider
- `PROCESSING_ERROR` - Error during video analysis
- `NETWORK_ERROR` - Network connectivity issue

### 2. Get Task Status

Check the status of an ongoing analysis task.

**Endpoint:**
```
GET /api/task/:taskId
```

**Headers:**
```
X-API-Key: your-api-key
```

**Response (200 OK):**
```json
{
  "taskId": "task-12345",
  "status": "processing",
  "progress": 45,
  "eta": 10
}
```

**Status Values:**
- `pending` - Task queued
- `processing` - Currently being processed
- `completed` - Task finished
- `failed` - Task failed

### 3. Health Check

Check if the API proxy is available.

**Endpoint:**
```
GET /api/health
```

**Response (200 OK):**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600
}
```

### 4. Get Supported Models

List available AI models.

**Endpoint:**
```
GET /api/models
```

**Response (200 OK):**
```json
{
  "providers": {
    "gemini": {
      "models": [
        {
          "id": "gemini-2.0-flash",
          "name": "Gemini 2.0 Flash",
          "description": "Fast and efficient model",
          "costPer1MTokens": 0.075
        }
      ]
    },
    "openai": {
      "models": [
        {
          "id": "gpt-4o",
          "name": "GPT-4o",
          "description": "Advanced reasoning model",
          "costPer1MTokens": 2.5
        }
      ]
    }
  }
}
```

## Authentication

### API Key Authentication

Include API key in request header:
```
X-API-Key: your-api-key
```

### Proxy Authentication

If using the proxy service without an API key:
```
Authorization: Bearer proxy-token
```

## Rate Limiting

All endpoints are rate limited. Response headers include:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1699564800
```

When rate limit is exceeded:
- Status: `429 Too Many Requests`
- Response includes `retryAfter` in seconds

## Request Examples

### cURL

```bash
curl -X POST https://api.insightreel.app/api/analyze-video \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sk_prod_1234567890" \
  -d '{
    "videoUrl": "https://youtube.com/watch?v=dQw4w9WgXcQ",
    "analysisType": "summary",
    "provider": "gemini",
    "model": "gemini-2.0-flash",
    "language": "en"
  }'
```

### JavaScript/TypeScript

```typescript
async function analyzeVideo(videoUrl: string, analysisType: string) {
  const response = await fetch('https://api.insightreel.app/api/analyze-video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'your-api-key'
    },
    body: JSON.stringify({
      videoUrl,
      analysisType,
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      language: 'en'
    })
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.result;
}
```

### Python

```python
import requests

def analyze_video(video_url, analysis_type):
    headers = {
        'Content-Type': 'application/json',
        'X-API-Key': 'your-api-key'
    }
    
    payload = {
        'videoUrl': video_url,
        'analysisType': analysis_type,
        'provider': 'gemini',
        'model': 'gemini-2.0-flash',
        'language': 'en'
    }
    
    response = requests.post(
        'https://api.insightreel.app/api/analyze-video',
        json=payload,
        headers=headers
    )
    
    response.raise_for_status()
    return response.json()['result']
```

## Supported Analysis Types

### Summary
Generates a concise summary of the video content.

**Prompt Template:**
```
Summarize the following video content in key points:
[Video content]
```

**Output:** Bullet-point summary (5-10 points)

### Key Moments
Identifies important timestamps and scenes.

**Output Format:**
```
[00:45] - Interesting transition
[02:30] - Key announcement
[05:15] - Important visual
```

### Translation
Translates subtitles or transcripts to target language.

**Supported Languages:**
- English (en)
- 中文 (zh)
- Español (es)
- Français (fr)
- Deutsch (de)

### Chat
Allows asking questions about video content.

**Message Format:**
```json
{
  "message": "What are the main topics discussed?",
  "context": "Previous chat history..."
}
```

## Caching Strategy

API responses are cached:

**Cache Duration by Type:**
- Summary: 24 hours
- Key Moments: 24 hours
- Translation: 7 days
- Chat: 1 hour (per conversation)

**Cache Key:** `hash(videoUrl) + analysisType + language`

## Retry Strategy

Automatic retries with exponential backoff:

```
Attempt 1: Immediately
Attempt 2: After 1 second
Attempt 3: After 2 seconds
Attempt 4: After 4 seconds
Attempt 5: After 8 seconds
```

Maximum 5 retry attempts.

## CORS & Browser Security

The proxy API must have proper CORS headers:

```
Access-Control-Allow-Origin: https://insightreel.app
Access-Control-Allow-Methods: POST, GET, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization
Access-Control-Max-Age: 86400
```

## Error Handling Best Practices

```typescript
async function analyzeWithRetry(
  videoUrl: string,
  analysisType: string,
  maxRetries: number = 3
) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch('/api/analyze-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'your-api-key'
        },
        body: JSON.stringify({
          videoUrl,
          analysisType,
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          language: 'en'
        })
      });

      if (response.status === 429) {
        const retryAfter = parseInt(
          response.headers.get('X-RateLimit-Reset') || '60'
        );
        console.log(`Rate limited. Retry after ${retryAfter}s`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.result;

    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

## Monitoring & Logging

All requests are logged with:
- Timestamp
- User ID
- Video URL (hashed)
- Analysis type
- Processing time
- Response size
- Error details (if applicable)

## Pricing

Costs based on provider and token usage:

- **Gemini:** $0.075 per 1M input tokens, $0.30 per 1M output tokens
- **OpenAI:** $2.50 per 1M input tokens, $10 per 1M output tokens
- **Poe:** Custom pricing via platform

## Support

For API issues, contact: support@insightreel.app

- Documentation: https://docs.insightreel.app
- Status Page: https://status.insightreel.app
- Slack: insightreel-api.slack.com
