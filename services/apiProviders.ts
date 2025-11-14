/**
 * API Provider Adapters
 * Support for multiple AI API providers (Gemini, OpenAI, Poe, etc.)
 */

import { APIProvider, ProviderConfig } from '../types';

// Provider configurations
export const PROVIDER_CONFIGS: Record<APIProvider, ProviderConfig> = {
  gemini: {
    name: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-2.5-flash',
    requiresProxy: false,
    supportsStreaming: true,
    supportsVision: true,
    supportsAudio: true,
  },
  openai: {
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    requiresProxy: false,
    supportsStreaming: true,
    supportsVision: true,
    supportsAudio: true,
  },
  poe: {
    name: 'Poe API',
    defaultBaseUrl: 'https://api.poe.com/v1',
    defaultModel: 'GPT-4o',
    requiresProxy: true, // Poe requires proxy due to CORS
    supportsStreaming: true,
    supportsVision: false,
    supportsAudio: false,
  },
  custom: {
    name: 'Custom API',
    defaultBaseUrl: '',
    defaultModel: 'default',
    requiresProxy: true, // Custom APIs often have CORS issues, recommend proxy
    supportsStreaming: false,
    supportsVision: false,
    supportsAudio: false,
  },
};

export interface APIRequest {
  prompt: string;
  systemInstruction?: string;
  images?: string[]; // base64 encoded
  audioData?: { data: string; mimeType: string };
  temperature?: number;
  maxTokens?: number;
}

export interface APIResponse {
  text: string;
  finishReason?: string;
}

/**
 * Base API adapter interface
 */
export interface APIAdapter {
  generateContent(request: APIRequest): Promise<APIResponse>;
  generateContentStream(
    request: APIRequest,
    onChunk: (text: string) => void
  ): Promise<APIResponse>;
}

/**
 * Gemini API Adapter
 */
export class GeminiAdapter implements APIAdapter {
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private model: string
  ) {}

  private buildUrl(endpoint: string): string {
    return `${this.baseUrl}/v1beta/models/${this.model}:${endpoint}?key=${this.apiKey}`;
  }

  private buildPayload(request: APIRequest): any {
    const parts: any[] = [];

    // Add images
    if (request.images && request.images.length > 0) {
      parts.push(
        ...request.images.map((img) => ({
          inlineData: { mimeType: 'image/jpeg', data: img },
        }))
      );
    }

    // Add audio
    if (request.audioData) {
      parts.push({
        inlineData: {
          mimeType: request.audioData.mimeType,
          data: request.audioData.data,
        },
      });
    }

    // Add text prompt
    parts.push({ text: request.prompt });

    const payload: any = {
      contents: [{ role: 'user', parts }],
    };

    if (request.systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: request.systemInstruction }],
      };
    }

    if (request.temperature !== undefined) {
      payload.generationConfig = { temperature: request.temperature };
    }

    return payload;
  }

  async generateContent(request: APIRequest): Promise<APIResponse> {
    const url = this.buildUrl('generateContent');
    const payload = this.buildPayload(request);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
    const finishReason = data.candidates?.[0]?.finishReason;

    if (!text && finishReason !== 'STOP') {
      throw new Error(`No content returned. Finish reason: ${finishReason}`);
    }

    return { text, finishReason };
  }

  async generateContentStream(
    request: APIRequest,
    onChunk: (text: string) => void
  ): Promise<APIResponse> {
    const url = this.buildUrl('streamGenerateContent');
    const payload = this.buildPayload(request);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              fullText += text;
              onChunk(fullText);
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    return { text: fullText };
  }
}

/**
 * OpenAI API Adapter
 */
export class OpenAIAdapter implements APIAdapter {
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private model: string
  ) {}

  private buildMessages(request: APIRequest): any[] {
    const messages: any[] = [];

    if (request.systemInstruction) {
      messages.push({ role: 'system', content: request.systemInstruction });
    }

    const content: any[] = [{ type: 'text', text: request.prompt }];

    // Add images
    if (request.images && request.images.length > 0) {
      content.push(
        ...request.images.map((img) => ({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${img}` },
        }))
      );
    }

    messages.push({ role: 'user', content });

    return messages;
  }

  async generateContent(request: APIRequest): Promise<APIResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    const messages = this.buildMessages(request);

    const payload: any = {
      model: this.model,
      messages,
    };

    if (request.temperature !== undefined) {
      payload.temperature = request.temperature;
    }
    if (request.maxTokens) {
      payload.max_tokens = request.maxTokens;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    const finishReason = data.choices?.[0]?.finish_reason;

    return { text, finishReason };
  }

  async generateContentStream(
    request: APIRequest,
    onChunk: (text: string) => void
  ): Promise<APIResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    const messages = this.buildMessages(request);

    const payload: any = {
      model: this.model,
      messages,
      stream: true,
    };

    if (request.temperature !== undefined) {
      payload.temperature = request.temperature;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') continue;

          try {
            const data = JSON.parse(jsonStr);
            const delta = data.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              onChunk(fullText);
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    return { text: fullText };
  }
}

/**
 * Poe API Adapter
 */
export class PoeAdapter implements APIAdapter {
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private model: string
  ) {}

  async generateContent(request: APIRequest): Promise<APIResponse> {
    const url = `${this.baseUrl}/bot/${this.model}`;

    const payload: any = {
      query: request.prompt,
      user_id: 'user',
      conversation_id: `conv_${Date.now()}`,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`Poe API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.text ?? '';

    return { text };
  }

  async generateContentStream(
    request: APIRequest,
    onChunk: (text: string) => void
  ): Promise<APIResponse> {
    // Poe streaming implementation
    const url = `${this.baseUrl}/bot/${this.model}`;

    const payload: any = {
      query: request.prompt,
      user_id: 'user',
      conversation_id: `conv_${Date.now()}`,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`Poe API error: ${error.error?.message || response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            if (data.text) {
              fullText = data.text; // Poe sends full text each time
              onChunk(fullText);
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    return { text: fullText };
  }
}

/**
 * Create appropriate adapter based on provider
 */
export function createAPIAdapter(
  provider: APIProvider,
  apiKey: string,
  baseUrl: string,
  model: string
): APIAdapter {
  switch (provider) {
    case 'gemini':
      return new GeminiAdapter(apiKey, baseUrl, model);
    case 'openai':
      return new OpenAIAdapter(apiKey, baseUrl, model);
    case 'poe':
      return new PoeAdapter(apiKey, baseUrl, model);
    case 'custom':
      // For custom, try Gemini format first
      return new GeminiAdapter(apiKey, baseUrl, model);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
