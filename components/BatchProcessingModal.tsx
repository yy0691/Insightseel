/**
 * Batch Processing Modal - 批量处理界面
 */

import React, { useState } from 'react';
import { X, Upload, Link as LinkIcon } from 'lucide-react';
import {
  processBatch,
  extractPlaylistVideos,
  exportBatchResults,
  BatchJob,
  BatchProgress
} from '../services/batchProcessingService';
import { PipelineOptions } from '../services/videoProcessingPipeline';
import { TranscriptionEngine } from '../services/transcriptionService';
import { TargetLanguage, SubtitleMode } from '../services/subtitlePolishService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function BatchProcessingModal({ isOpen, onClose }: Props) {
  const [sources, setSources] = useState<Array<string | File>>([]);
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [results, setResults] = useState<BatchJob[]>([]);

  // 处理选项
  const [engine, setEngine] = useState<TranscriptionEngine>('deepgram');
  const [translateTo, setTranslateTo] = useState<TargetLanguage | undefined>('zh-CN');
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>('translation-only');
  const [burnSubtitles, setBurnSubtitles] = useState(true);

  if (!isOpen) return null;

  const handleAddFiles = (files: FileList) => {
    const newFiles = Array.from(files).filter(f => f.type.startsWith('video/'));
    setSources([...sources, ...newFiles]);
  };

  const handleAddPlaylist = async () => {
    if (!playlistUrl) return;

    try {
      const videos = await extractPlaylistVideos(playlistUrl);
      setSources([...sources, ...videos]);
      setPlaylistUrl('');
    } catch (error) {
      alert(error instanceof Error ? error.message : '获取播放列表失败');
    }
  };

  const handleProcess = async () => {
    if (sources.length === 0) return;

    setProcessing(true);
    setResults([]);

    try {
      const options: PipelineOptions = {
        transcriptionEngine: engine,
        translateTo,
        subtitleMode,
        burnSubtitles,
        generateMarkdown: true,
        preserveTechnicalTerms: true
      };

      const jobs = await processBatch(sources, options, setProgress, 2);
      setResults(jobs);

    } catch (error) {
      console.error('[Batch] Error:', error);
      alert(error instanceof Error ? error.message : '批量处理失败');
    } finally {
      setProcessing(false);
    }
  };

  const handleExport = async () => {
    try {
      const zipBlob = await exportBatchResults(results, 'zip');
      if (zipBlob) {
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `batch-results-${Date.now()}.zip`;
        a.click();
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : '导出失败');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">批量视频处理</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        {!processing && results.length === 0 && (
          <div className="space-y-6">
            {/* 添加视频源 */}
            <div className="space-y-4">
              <h3 className="font-medium">添加视频</h3>

              <div className="flex gap-4">
                <label className="flex-1 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 transition-colors">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <span className="text-sm text-gray-600">点击选择视频文件</span>
                  <input
                    type="file"
                    multiple
                    accept="video/*"
                    onChange={(e) => e.target.files && handleAddFiles(e.target.files)}
                    className="hidden"
                  />
                </label>

                <div className="flex-1 border border-gray-300 rounded-lg p-4">
                  <div className="flex gap-2 mb-2">
                    <LinkIcon className="w-5 h-5 text-gray-400" />
                    <span className="text-sm font-medium">播放列表 URL</span>
                  </div>
                  <input
                    type="text"
                    value={playlistUrl}
                    onChange={(e) => setPlaylistUrl(e.target.value)}
                    placeholder="https://youtube.com/playlist?list=..."
                    className="w-full p-2 border rounded text-sm"
                  />
                  <button
                    onClick={handleAddPlaylist}
                    className="mt-2 w-full bg-gray-100 hover:bg-gray-200 py-1 rounded text-sm"
                  >
                    添加播放列表
                  </button>
                </div>
              </div>

              {/* 视频列表 */}
              {sources.length > 0 && (
                <div className="border rounded-lg p-4 max-h-40 overflow-y-auto">
                  <div className="text-sm font-medium mb-2">已添加 {sources.length} 个视频</div>
                  <ul className="space-y-1 text-sm text-gray-600">
                    {sources.map((source, i) => (
                      <li key={i} className="flex items-center justify-between">
                        <span className="truncate">
                          {typeof source === 'string' ? source : source.name}
                        </span>
                        <button
                          onClick={() => setSources(sources.filter((_, j) => j !== i))}
                          className="text-red-500 hover:text-red-700 ml-2"
                        >
                          移除
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* 处理选项 */}
            <div className="space-y-4">
              <h3 className="font-medium">处理选项</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">转写引擎</label>
                  <select
                    value={engine}
                    onChange={(e) => setEngine(e.target.value as TranscriptionEngine)}
                    className="w-full p-2 border rounded"
                  >
                    <option value="deepgram">Deepgram</option>
                    <option value="whisper">Whisper API</option>
                    <option value="whisper-mlx">Whisper MLX</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">翻译语言</label>
                  <select
                    value={translateTo || ''}
                    onChange={(e) => setTranslateTo(e.target.value as TargetLanguage || undefined)}
                    className="w-full p-2 border rounded"
                  >
                    <option value="">不翻译</option>
                    <option value="zh-CN">简体中文</option>
                    <option value="zh-TW">繁体中文</option>
                    <option value="en">英语</option>
                  </select>
                </div>

                {translateTo && (
                  <div>
                    <label className="block text-sm font-medium mb-1">字幕模式</label>
                    <select
                      value={subtitleMode}
                      onChange={(e) => setSubtitleMode(e.target.value as SubtitleMode)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="translation-only">仅翻译</option>
                      <option value="bilingual">双语</option>
                    </select>
                  </div>
                )}

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="batch-burn"
                    checked={burnSubtitles}
                    onChange={(e) => setBurnSubtitles(e.target.checked)}
                  />
                  <label htmlFor="batch-burn" className="ml-2 text-sm">烧录字幕</label>
                </div>
              </div>
            </div>

            <button
              onClick={handleProcess}
              disabled={sources.length === 0}
              className="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              开始批量处理
            </button>
          </div>
        )}

        {processing && progress && (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>总体进度</span>
                <span>{progress.completedJobs}/{progress.totalJobs}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-blue-500 h-3 rounded-full transition-all"
                  style={{ width: `${progress.overallProgress}%` }}
                />
              </div>
            </div>

            {progress.currentJob && (
              <div className="border rounded-lg p-4">
                <div className="text-sm font-medium mb-2">
                  当前处理: {progress.currentJob.title}
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${progress.currentJob.progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-medium">
                处理完成: {results.filter(r => r.status === 'completed').length}/{results.length}
              </h3>
              <button
                onClick={handleExport}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              >
                导出全部 (ZIP)
              </button>
            </div>

            <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
              {results.map((job) => (
                <div key={job.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium truncate">{job.title}</div>
                      <div className="text-xs text-gray-500">
                        {job.status === 'completed' && '✓ 完成'}
                        {job.status === 'failed' && `✗ 失败: ${job.error}`}
                      </div>
                    </div>
                    {job.status === 'completed' && job.result?.videoWithSubtitles && (
                      <a
                        href={URL.createObjectURL(job.result.videoWithSubtitles)}
                        download={`${job.title}-subtitled.mp4`}
                        className="text-blue-500 hover:text-blue-700 text-sm ml-2"
                      >
                        下载
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={onClose}
              className="w-full border border-gray-300 py-2 rounded hover:bg-gray-50"
            >
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
