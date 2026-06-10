/**
 * Video Info API - 获取视频信息（不下载）
 */

import { spawn } from 'child_process';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing video URL' });
    }

    const info = await getVideoInfo(url);

    if (!info.success) {
      return res.status(500).json({ error: info.error });
    }

    return res.status(200).json(info.data);

  } catch (error) {
    console.error('[VideoInfo] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get video info'
    });
  }
}

/**
 * 使用 yt-dlp 获取视频信息
 */
function getVideoInfo(url: string): Promise<{
  success: boolean;
  data?: {
    title: string;
    duration: number;
    thumbnail?: string;
    description?: string;
  };
  error?: string;
}> {
  return new Promise((resolve) => {
    const args = [
      url,
      '--dump-json',
      '--no-playlist',
      '--skip-download'
    ];

    const proc = spawn('yt-dlp', args);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const info = JSON.parse(stdout);
          resolve({
            success: true,
            data: {
              title: info.title || 'Unknown',
              duration: info.duration || 0,
              thumbnail: info.thumbnail,
              description: info.description
            }
          });
        } catch {
          resolve({
            success: false,
            error: 'Failed to parse video info'
          });
        }
      } else {
        resolve({
          success: false,
          error: stderr || 'yt-dlp failed'
        });
      }
    });
  });
}
