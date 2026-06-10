/**
 * Playlist Info API - 获取播放列表信息
 */

import { spawn } from 'child_process';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing playlist URL' });
    }

    const videos = await getPlaylistVideos(url);

    if (!videos.success) {
      return res.status(500).json({ error: videos.error });
    }

    return res.status(200).json({
      videos: videos.data,
      count: videos.data?.length || 0
    });

  } catch (error) {
    console.error('[Playlist] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get playlist info'
    });
  }
}

/**
 * 使用 yt-dlp 获取播放列表视频
 */
function getPlaylistVideos(url: string): Promise<{
  success: boolean;
  data?: string[];
  error?: string;
}> {
  return new Promise((resolve) => {
    const args = [
      url,
      '--flat-playlist',
      '--print', 'url',
      '--no-warnings'
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
        const videos = stdout
          .trim()
          .split('\n')
          .filter(line => line.trim().length > 0);

        resolve({
          success: true,
          data: videos
        });
      } else {
        resolve({
          success: false,
          error: stderr || 'yt-dlp failed'
        });
      }
    });
  });
}
