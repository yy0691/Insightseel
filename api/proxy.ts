// Type-only import removed to avoid dependency on '@vercel/node' during local builds

type APIProvider = 'gemini' | 'openai' | 'poe' | 'custom';

interface ProxyConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Get provider configuration from environment variables
 */
function getProviderConfig(provider: APIProvider): ProxyConfig | null {
  switch (provider) {
    case 'gemini':
      return {
        apiKey: process.env.GEMINI_API_KEY || '',
        baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      };
    case 'openai':
      return {
        apiKey: process.env.OPENAI_API_KEY || '',
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      };
    case 'poe':
      return {
        apiKey: process.env.POE_API_KEY || '',
        baseUrl: process.env.POE_BASE_URL || 'https://api.poe.com/v1',
        model: process.env.POE_MODEL || 'GPT-4o-mini',
      };
    case 'custom':
      return {
        apiKey: process.env.CUSTOM_API_KEY || '',
        baseUrl: process.env.CUSTOM_BASE_URL || '',
        model: process.env.CUSTOM_MODEL || 'default',
      };
    default:
      return null;
  }
}

/**
 * Handle Gemini API request
 */
async function handleGeminiRequest(
  config: ProxyConfig,
  contents: any,
  systemInstruction?: string,
  stream?: boolean
): Promise<Response> {
  const url = `${config.baseUrl.replace(/\/$/, '')}/v1beta/models/${config.model}:${stream ? 'streamGenerateContent' : 'generateContent'}?key=${config.apiKey}`;
  
  const payload: any = {
    contents: Array.isArray(contents) ? contents : [contents]
  };

  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Handle OpenAI API request
 */
async function handleOpenAIRequest(
  config: ProxyConfig,
  contents: any,
  systemInstruction?: string,
  stream?: boolean
): Promise<Response> {
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  
  // Convert Gemini-style contents to OpenAI messages format
  const messages: any[] = [];
  
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }

  // Parse contents array
  const contentsArray = Array.isArray(contents) ? contents : [contents];
  
  for (const content of contentsArray) {
    const role = content.role === 'model' ? 'assistant' : content.role || 'user';
    const parts = content.parts || [];
    
    const messageContent: any[] = [];
    
    for (const part of parts) {
      if (part.text) {
        messageContent.push({ type: 'text', text: part.text });
      }
      if (part.inlineData) {
        const mimeType = part.inlineData.mimeType || 'image/jpeg';
        const data = part.inlineData.data;
        
        // OpenAI supports images but not audio in vision API
        if (mimeType.startsWith('image/')) {
          messageContent.push({
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${data}` }
          });
        }
      }
    }
    
    messages.push({
      role,
      content: messageContent.length === 1 && messageContent[0].type === 'text' 
        ? messageContent[0].text 
        : messageContent
    });
  }

  const payload: any = {
    model: config.model,
    messages,
    stream: stream || false,
  };

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Handle Poe API request
 */
async function handlePoeRequest(
  config: ProxyConfig,
  contents: any,
  systemInstruction?: string
): Promise<Response> {
  // Extract the user query from contents
  const contentsArray = Array.isArray(contents) ? contents : [contents];
  let query = '';
  
  for (const content of contentsArray) {
    const parts = content.parts || [];
    for (const part of parts) {
      if (part.text) {
        query += part.text + '\n';
      }
    }
  }
  
  if (systemInstruction) {
    query = systemInstruction + '\n\n' + query;
  }

  const url = `${config.baseUrl.replace(/\/$/, '')}/bot/${config.model}`;
  
  const payload = {
    query: query.trim(),
    user_id: 'user',
    conversation_id: `conv_${Date.now()}`,
  };

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Main proxy handler
 */
export default async function handler(req: any, res: any) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { provider = 'gemini', contents, systemInstruction, stream } = req.body;
    
    // Log request size for debugging
    const requestBodySize = JSON.stringify(req.body).length;
    const requestSizeMB = (requestBodySize / (1024 * 1024)).toFixed(2);
    console.log(`[${provider}] Request body size: ${requestSizeMB}MB`);
    
    // Vercel has a 4.5MB limit for serverless function payloads
    if (requestBodySize > 4.5 * 1024 * 1024) {
      return res.status(413).json({ 
        error: `Request too large (${requestSizeMB}MB). Vercel serverless functions have a 4.5MB limit. Please use a smaller video file or compress it.` 
      });
    }

    if (!contents) {
      return res.status(400).json({ error: 'Missing required field: contents' });
    }

    // Get provider configuration
    const config = getProviderConfig(provider as APIProvider);
    
    if (!config) {
      return res.status(400).json({ error: `Unsupported provider: ${provider}` });
    }

    if (!config.apiKey) {
      return res.status(500).json({ 
        error: `Server configuration error: ${provider.toUpperCase()}_API_KEY not set in environment variables.` 
      });
    }

    // Log API call details (without sensitive data)
    console.log(`[${provider}] Calling API:`, {
      baseUrl: config.baseUrl,
      model: config.model,
      hasInlineData: JSON.stringify(contents).includes('inlineData'),
      contentCount: Array.isArray(contents) ? contents.length : 1,
      stream: stream || false,
    });

    // Route to appropriate handler
    let response: Response;
    
    switch (provider as APIProvider) {
      case 'gemini':
      case 'custom':
        response = await handleGeminiRequest(config, contents, systemInstruction, stream);
        break;
      case 'openai':
        response = await handleOpenAIRequest(config, contents, systemInstruction, stream);
        break;
      case 'poe':
        response = await handlePoeRequest(config, contents, systemInstruction);
        break;
      default:
        return res.status(400).json({ error: `Unsupported provider: ${provider}` });
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        error: { message: response.statusText } 
      }));
      const errorMessage = errorData.error?.message || errorData.error || 'API request failed';
      console.error(`[${provider}] API error:`, {
        status: response.status,
        statusText: response.statusText,
        error: errorMessage,
      });
      return res.status(response.status).json({ 
        error: `${provider} API error: ${errorMessage} (status: ${response.status})`
      });
    }

    // Handle streaming response
    if (stream && response.body) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
        res.end();
      } catch (streamError) {
        console.error(`[${provider}] Streaming error:`, streamError);
        res.end();
      }
      return;
    }

    // Handle normal response
    const data = await response.json();
    
    // Normalize response format for different providers
    let normalizedData = data;
    
    if (provider === 'openai') {
      // Convert OpenAI format to Gemini-like format for consistency
      const text = data.choices?.[0]?.message?.content || '';
      normalizedData = {
        candidates: [{
          content: {
            parts: [{ text }]
          },
          finishReason: data.choices?.[0]?.finish_reason?.toUpperCase() || 'STOP'
        }]
      };
    } else if (provider === 'poe') {
      // Convert Poe format to Gemini-like format
      const text = data.text || '';
      normalizedData = {
        candidates: [{
          content: {
            parts: [{ text }]
          },
          finishReason: 'STOP'
        }]
      };
    }
    
    return res.status(200).json(normalizedData);
  } catch (error) {
    console.error('Proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Detailed error:', {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return res.status(500).json({ 
      error: `Proxy failed: ${errorMessage}. Please check server logs for details.`
    });
  }
}
