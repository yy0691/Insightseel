/**
 * 批量视频处理服务
 * 支持播放列表和多文件处理
 */

import { SubtitleSegment } from '../types';
import { processVideoComplete, PipelineOptions, PipelineResult, PipelineProgress } from './videoProcessingPipeline';

export interface BatchJob {
  id: string;
  source: string | File;
  title: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: PipelineResult;
  error?: string;
}

export interface BatchProgress {
  totalJobs: number;
  completedJobs: number;
  currentJob?: BatchJob;
  overallProgress: number;
}

/**
 * 批量处理多个视频
 */
export async function processBatch(
  sources: Array<string | File>,
  options: PipelineOptions,
  onProgress?: (progress: BatchProgress) => void,
  maxConcurrent: number = 2
): Promise<BatchJob[]> {
  console.log(`[Batch] Starting batch processing: ${sources.length} videos`);

  const jobs: BatchJob[] = sources.map((source, i) => ({
    id: `job-${i}-${Date.now()}`,
    source,
    title: typeof source === 'string' ? source : source.name,
    status: 'pending' as const,
    progress: 0
  }));

  const results: BatchJob[] = [];
  const queue = [...jobs];
  const processing: Promise<void>[] = [];

  while (queue.length > 0 || processing.length > 0) {
    // 启动新任务（不超过并发限制）
    while (queue.length > 0 && processing.length < maxConcurrent) {
      const job = queue.shift()!;
      job.status = 'processing';

      const task = processVideoComplete(
        job.source,
        options,
        (pipelineProgress: PipelineProgress) => {
          job.progress = pipelineProgress.progress;

          onProgress?.({
            totalJobs: jobs.length,
            completedJobs: results.length,
            currentJob: job,
            overallProgress: calculateOverallProgress(jobs)
          });
        }
      )
        .then((result) => {
          job.status = 'completed';
          job.progress = 100;
          job.result = result;
          results.push(job);
        })
        .catch((error) => {
          job.status = 'failed';
          job.error = error instanceof Error ? error.message : 'Processing failed';
          results.push(job);
        });

      processing.push(task);
    }

    // 等待至少一个任务完成
    if (processing.length > 0) {
      await Promise.race(processing);
      // 移除已完成的任务
      processing.splice(
        processing.findIndex(p => p === undefined),
        1
      );
    }
  }

  console.log(`[Batch] Batch processing complete: ${results.filter(j => j.status === 'completed').length}/${jobs.length} succeeded`);

  return results;
}

/**
 * 计算总体进度
 */
function calculateOverallProgress(jobs: BatchJob[]): number {
  if (jobs.length === 0) return 0;
  const totalProgress = jobs.reduce((sum, job) => sum + job.progress, 0);
  return totalProgress / jobs.length;
}

/**
 * 从播放列表 URL 提取视频列表
 */
export async function extractPlaylistVideos(playlistUrl: string): Promise<string[]> {
  const downloadServiceUrl = import.meta.env.VITE_DOWNLOAD_SERVICE_URL;

  if (!downloadServiceUrl) {
    throw new Error('下载服务未配置');
  }

  try {
    const response = await fetch(`${downloadServiceUrl}/playlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: playlistUrl })
    });

    if (!response.ok) {
      throw new Error('Failed to fetch playlist info');
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    return data.videos || [];
  } catch (error) {
    console.error('[Batch] Failed to extract playlist:', error);
    throw error;
  }
}

/**
 * 批量导出结果
 */
export async function exportBatchResults(
  jobs: BatchJob[],
  format: 'zip' | 'folder'
): Promise<Blob | void> {
  const completedJobs = jobs.filter(j => j.status === 'completed' && j.result);

  if (completedJobs.length === 0) {
    throw new Error('No completed jobs to export');
  }

  if (format === 'zip') {
    // 使用 JSZip 打包
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    for (const job of completedJobs) {
      const folderName = sanitizeFilename(job.title);
      const folder = zip.folder(folderName);

      if (!folder) continue;

      // 添加视频
      if (job.result?.videoWithSubtitles) {
        folder.file('video-with-subtitles.mp4', job.result.videoWithSubtitles);
      }

      // 添加 Markdown
      if (job.result?.markdownTranscript) {
        folder.file('transcript.md', job.result.markdownTranscript);
      }

      // 添加元数据
      if (job.result?.metadata) {
        folder.file('metadata.json', JSON.stringify(job.result.metadata, null, 2));
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    return blob;
  }

  // folder 格式需要浏览器 File System Access API（暂不支持）
  throw new Error('Folder export not yet supported');
}

/**
 * 清理文件名
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}
