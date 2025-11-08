/**
 * Endpoint to check if Whisper API is available
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  
  return res.status(200).json({
    available: hasOpenAIKey,
    provider: hasOpenAIKey ? 'openai' : 'none'
  });
}
