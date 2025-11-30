/**
 * Vercel serverless function to proxy Linux.do OAuth token exchange
 * This solves CORS issues and protects the client_secret from exposure to the frontend
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const LINUXDO_TOKEN_URL = 'https://connect.linux.do/oauth2/token';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, client_id, redirect_uri, code_verifier, client_secret } = req.body;

    // Validate required parameters
    if (!code || !client_id || !redirect_uri || !code_verifier) {
      return res.status(400).json({
        error: 'Missing required parameters: code, client_id, redirect_uri, code_verifier',
      });
    }

    // Build request body
    const bodyParams: Record<string, string> = {
      grant_type: 'authorization_code',
      client_id,
      code,
      redirect_uri,
      code_verifier,
    };

    // Add client_secret if provided (for non-PKCE flows)
    if (client_secret) {
      bodyParams.client_secret = client_secret;
    }

    // Forward request to Linux.do
    const response = await fetch(LINUXDO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(bodyParams),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Linux.do Token] Error:', {
        status: response.status,
        error: data,
      });
      return res.status(response.status).json({
        error: data.error || 'Token exchange failed',
        error_description: data.error_description,
      });
    }

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    // Return token response
    return res.status(200).json(data);
  } catch (error) {
    console.error('[Linux.do Token] Unexpected error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

