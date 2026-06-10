/**
 * Video Download API - 后端视频下载服务
 * 使用 yt-dlp 下载视频
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url, options = {} } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing video URL' });
    }

    // 创建临时目录
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-download-'));
    const outputTemplate = path.join(tmpDir, '%(title)s.%(ext)s');

    // 构建 yt-dlp 命令
    const args = [
      url,
      '-o', outputTemplate,
      '--no-playlist',
      '--print', 'after_move:filepath'
    ];

    if (options.format === 'audio') {
      args.push('-x', '--audio-format', 'mp3');
    } else {
      args.push('-f', options.quality || 'best');
    }

    // 执行 yt-dlp
    const result = await executeYtDlp(args);

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // 返回文件路径（实际应该上传到存储服务）
    return res.status(200).json({
      success: true,
      filePath: result.filePath,
      title: result.title
    });

  } catch (error) {
    console.error('[Download] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Download failed'
    });
  }
}

/**
 * 执行 yt-dlp 命令
 */
function executeYtDlp(args: string[]): Promise<{
  success: boolean;
  filePath?: string;
  title?: string;
  error?: string;
}> {
  return new Promise((resolve) => {
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
        const filePath = stdout.trim().split('\n').pop();
        const title = path.basename(filePath || '', path.extname(filePath || ''));

        resolve({
          success: true,
          filePath,
          title
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
