/**
 * Vercel serverless function to proxy Whisper API requests
 * This protects the OpenAI API key from exposure to the frontend
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  api: {
    bodyParser: false, // We need to handle multipart/form-data
  },
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get API key from environment
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'OpenAI API key not configured on server' 
    });
  }

  try {
    // Forward the request to OpenAI Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      // @ts-ignore - Vercel handles the body properly
      body: req,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Whisper API error:', errorText);
      return res.status(response.status).json({ 
        error: `Whisper API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    
    // Return the transcription
    return res.status(200).json(data);
  } catch (error) {
    console.error('Whisper proxy error:', error);
    return res.status(500).json({ 
      error: 'Failed to process transcription',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}
