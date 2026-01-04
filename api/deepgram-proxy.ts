/**
 * Vercel serverless function to proxy Deepgram API requests
 * This solves CORS issues and protects the Deepgram API key from exposure to the frontend
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  api: {
    bodyParser: false, // We need to handle raw file data
  },
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // Only allow POST and GET requests
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get API key from request header or environment variable
  // Priority: Request header (from client) > Environment variable (server-side fallback)
  // Note: VITE_ prefixed env vars are NOT available in serverless functions
  // Client should pass the key via X-Deepgram-API-Key header (from VITE_DEEPGRAM_API_KEY or user settings)
  const apiKey = (req.headers['x-deepgram-api-key'] as string) || 
                 process.env.DEEPGRAM_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'Deepgram API key not configured. ' +
             'Please provide X-Deepgram-API-Key header (client will send it automatically), ' +
             'or set DEEPGRAM_API_KEY environment variable in Vercel (server-side fallback).' 
    });
  }

  try {
    // Handle GET request for API key validation (check projects endpoint)
    if (req.method === 'GET') {
      const checkResponse = await fetch('https://api.deepgram.com/v1/projects', {
        method: 'GET',
        headers: {
          'Authorization': `Token ${apiKey}`,
        },
      });

      if (!checkResponse.ok) {
        const errorText = await checkResponse.text();
        return res.status(checkResponse.status).json({ 
          valid: false,
          error: `Deepgram API validation failed: ${checkResponse.status}`,
          details: errorText
        });
      }

      const data = await checkResponse.json();
      return res.status(200).json({ 
        valid: true,
        projects: data
      });
    }

    // Handle POST request for transcription
    // Get query parameters from request
    const { 
      model = 'nova-2', 
      language, 
      smart_format = 'true', 
      punctuate = 'true',
      diarize = 'true',
      url_mode = 'false'
    } = req.query;
    
    // Build Deepgram API URL with parameters
    const params = new URLSearchParams({
      model: model as string,
      smart_format: smart_format as string,
      punctuate: punctuate as string,
      diarize: diarize as string,
      paragraphs: 'false',
      utterances: 'false',
    });

    if (language && language !== 'auto') {
      params.append('language', language as string);
    }

    const deepgramUrl = `https://api.deepgram.com/v1/listen?${params.toString()}`;

    // Check if this is URL mode (for large files)
    const isUrlMode = url_mode === 'true';

    if (isUrlMode) {
      // URL mode: Forward JSON request with file URL
      console.log('[Deepgram Proxy] URL mode - forwarding file URL to Deepgram');
      
      // Parse JSON body to get the URL
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      
      if (!body.url) {
        return res.status(400).json({ error: 'Missing url in request body for URL mode' });
      }

      console.log('[Deepgram Proxy] Forwarding URL request:', {
        url: deepgramUrl,
        fileUrl: body.url,
        hasApiKey: !!apiKey,
        keySource: req.headers['x-deepgram-api-key'] ? 'user' : 'system'
      });

      // 🎯 添加超时控制（URL模式通常需要更长时间）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 10分钟超时

      try {
        const response = await fetch(deepgramUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: body.url }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[Deepgram Proxy] API error (URL mode):', {
            status: response.status,
            statusText: response.statusText,
            error: errorText
          });
          return res.status(response.status).json({ 
            error: `Deepgram API error (${response.status}): ${response.statusText}`,
            details: errorText
          });
        }

        const data = await response.json();
        
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        return res.status(200).json(data);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.error('[Deepgram Proxy] Request timeout (URL mode)');
          return res.status(504).json({ 
            error: '请求超时。请稍后再试。',
            details: 'Request timed out. Please try again later.'
          });
        }
        throw fetchError;
      }
    }

    // Direct file upload mode (for small files)
    // Get content type from request
    const contentType = req.headers['content-type'] || 'video/mp4';

    console.log('[Deepgram Proxy] Direct mode - forwarding file content:', {
      url: deepgramUrl,
      contentType,
      hasApiKey: !!apiKey,
      keySource: req.headers['x-deepgram-api-key'] ? 'user' : 'system'
    });

    // Forward the request to Deepgram API
    // 🎯 添加超时控制（根据文件大小动态调整）
    const contentLength = req.headers['content-length'] ? parseInt(req.headers['content-length'], 10) : 0;
    const fileSizeMB = contentLength / (1024 * 1024);
    
    // 根据文件大小计算超时时间
    let timeoutMs = 60000; // 默认60秒
    if (fileSizeMB > 100) {
      timeoutMs = 300000; // 大文件：5分钟
    } else if (fileSizeMB > 10) {
      timeoutMs = 120000; // 中等文件：2分钟
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(deepgramUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': contentType,
        },
        // @ts-ignore - Vercel handles the body properly
        body: req,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Deepgram Proxy] API error (direct mode):', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        return res.status(response.status).json({ 
          error: `Deepgram API error (${response.status}): ${response.statusText}`,
          details: errorText
        });
      }

      const data = await response.json();
      
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      // Return the transcription
      return res.status(200).json(data);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('[Deepgram Proxy] Request timeout (direct mode):', {
          fileSizeMB: fileSizeMB.toFixed(2),
          timeoutMs
        });
        return res.status(504).json({ 
          error: '请求超时。请稍后再试。',
          details: `Request timed out after ${timeoutMs / 1000}s. Please try again later.`
        });
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('[Deepgram Proxy] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to process Deepgram request',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

