/**
 * Video Downloader - 支持多平台视频下载
 * 使用 yt-dlp 作为下载引擎
 */

export interface DownloadOptions {
  format?: 'video' | 'audio';
  quality?: 'best' | 'worst' | string;
  outputPath?: string;
  platform?: 'youtube' | 'bilibili' | 'tiktok' | 'twitter' | 'auto';
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  title?: string;
  duration?: number;
  error?: string;
}

export const supportedPlatforms = [
  'youtube.com', 'youtu.be',
  'bilibili.com', 'b23.tv',
  'douyin.com', 'tiktok.com',
  'twitter.com', 'x.com',
  'vimeo.com'
];

export function isSupportedPlatform(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return supportedPlatforms.some(platform => urlObj.hostname.includes(platform));
  } catch {
    return false;
  }
}

/**
 * 下载视频或提取音频
 */
export async function downloadVideo(
  url: string,
  options: DownloadOptions = {}
): Promise<DownloadResult> {
  const downloadServiceUrl = import.meta.env.VITE_DOWNLOAD_SERVICE_URL;

  if (!downloadServiceUrl) {
    return {
      success: false,
      error: '下载服务未配置。请设置 VITE_DOWNLOAD_SERVICE_URL 环境变量。'
    };
  }

  try {
    const response = await fetch(`${downloadServiceUrl}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Download failed' };
    }

    const data = await response.json();

    if (!data.success) {
      return { success: false, error: data.error };
    }

    // 从返回的 URL 下载视频到浏览器
    const videoResponse = await fetch(data.url);
    const blob = await videoResponse.blob();
    const file = new File([blob], `${data.title}.mp4`, { type: 'video/mp4' });

    return {
      success: true,
      filePath: data.url,
      title: data.title,
      duration: data.duration,
      file
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Download failed'
    };
  }
}

/**
 * 获取视频信息（不下载）
 */
export async function getVideoInfo(url: string): Promise<{
  title: string;
  duration: number;
  thumbnail?: string;
  description?: string;
}> {
  const downloadServiceUrl = import.meta.env.VITE_DOWNLOAD_SERVICE_URL;

  if (!downloadServiceUrl) {
    throw new Error('下载服务未配置');
  }

  const response = await fetch(`${downloadServiceUrl}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch video info');
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error);
  }

  return {
    title: data.title,
    duration: data.duration,
    thumbnail: data.thumbnail,
    description: data.description
  };
}
