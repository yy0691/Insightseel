/**
 * Get upload URL for direct file upload to object storage
 * This avoids sending large files through Vercel serverless functions
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileName, fileType, fileSize } = req.body;

    if (!fileName || !fileType) {
      return res.status(400).json({ error: 'Missing fileName or fileType' });
    }

    // Get Supabase credentials from environment
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return res.status(500).json({ 
        error: 'Supabase URL not configured. Please set VITE_SUPABASE_URL or SUPABASE_URL environment variable.' 
      });
    }

    if (!supabaseServiceKey) {
      return res.status(500).json({ 
        error: 'Supabase service role key not configured. Please set SUPABASE_SERVICE_ROLE_KEY environment variable.' 
      });
    }

    // Create Supabase client with service role key (for server-side operations)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate a unique file path
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const fileExtension = fileName.split('.').pop() || 'mp4';
    const filePath = `videos/${timestamp}-${randomId}.${fileExtension}`;

    // Supabase Storage upload approach:
    // 1. Client uploads directly using Supabase client (with auth)
    // 2. Or we generate a signed URL for upload
    // For now, we'll return the file path and let client upload directly
    // Client should use Supabase client with authentication
    
    // Return file path and upload instructions
    // Client will use: supabase.storage.from('video-uploads').upload(filePath, file)
    return res.status(200).json({
      filePath: filePath,
      bucket: 'video-uploads',
      uploadMethod: 'direct', // Client should use Supabase client
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      note: 'Use Supabase client to upload: supabase.storage.from("video-uploads").upload(filePath, file)',
    });
  } catch (error) {
    console.error('[Upload URL] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to generate upload URL',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

