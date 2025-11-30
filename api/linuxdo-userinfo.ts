/**
 * Vercel serverless function to proxy Linux.do user info API requests
 * This solves CORS issues when fetching user information
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const LINUXDO_USER_INFO_URL = 'https://connect.linux.do/api/user';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid Authorization header',
      });
    }

    const accessToken = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Forward request to Linux.do
    const response = await fetch(LINUXDO_USER_INFO_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Linux.do UserInfo] Error:', {
        status: response.status,
        error: data,
      });
      return res.status(response.status).json({
        error: data.error || 'Failed to fetch user info',
        error_description: data.error_description,
      });
    }

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    // Return user info
    return res.status(200).json(data);
  } catch (error) {
    console.error('[Linux.do UserInfo] Unexpected error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

