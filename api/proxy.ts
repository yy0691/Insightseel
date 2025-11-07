import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get backend-only environment variables (without VITE_ prefix)
  const API_KEY = process.env.GEMINI_API_KEY;
  const BASE_URL = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
  const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (!API_KEY) {
    return res.status(500).json({ error: 'Server configuration error: API key not set. Please add GEMINI_API_KEY to environment variables.' });
  }

  try {
    const { contents, systemInstruction } = req.body;
    
    // Log request size for debugging
    const requestBodySize = JSON.stringify(req.body).length;
    const requestSizeMB = (requestBodySize / (1024 * 1024)).toFixed(2);
    console.log(`Request body size: ${requestSizeMB}MB`);
    
    // Vercel has a 4.5MB limit for serverless function payloads
    if (requestBodySize > 4.5 * 1024 * 1024) {
      return res.status(413).json({ 
        error: `Request too large (${requestSizeMB}MB). Vercel serverless functions have a 4.5MB limit. Please use a smaller video file or compress it.` 
      });
    }

    if (!contents) {
      return res.status(400).json({ error: 'Missing required field: contents' });
    }

    // Build the request to Gemini API
    const url = `${BASE_URL.replace(/\/$/, '')}/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
    
    const payload: any = {
      contents: Array.isArray(contents) ? contents : [contents]
    };

    if (systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    // Log API call details (without sensitive data)
    console.log('Calling API:', {
      baseUrl: BASE_URL,
      model: MODEL,
      hasVideo: contents.some?.((c: any) => c.parts?.some?.((p: any) => p.inlineData)),
      contentCount: Array.isArray(contents) ? contents.length : 1
    });

    // Forward the request to Gemini API
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        error: { message: response.statusText } 
      }));
      const errorMessage = errorData.error?.message || errorData.error || 'API request failed';
      console.error('API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorMessage,
        baseUrl: BASE_URL
      });
      return res.status(response.status).json({ 
        error: `中转API返回错误: ${errorMessage} (状态码: ${response.status})`
      });
    }

    const data = await response.json();
    
    // Return the response to the client
    return res.status(200).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Detailed error:', {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      apiKey: API_KEY ? 'configured' : 'missing',
      baseUrl: BASE_URL,
      model: MODEL
    });
    return res.status(500).json({ 
      error: `Proxy failed: ${errorMessage}. Please check server logs for details.`
    });
  }
}
