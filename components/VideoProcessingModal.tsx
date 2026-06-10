/**
 * Video Processing Modal - 完整视频处理界面
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import {
  processVideoComplete,
  PipelineOptions,
  PipelineProgress
} from '../services/videoProcessingPipeline';
import { TranscriptionEngine } from '../services/transcriptionService';
import { TargetLanguage, SubtitleMode } from '../services/subtitlePolishService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  videoSource?: string | File;
}

export default function VideoProcessingModal({ isOpen, onClose, videoSource }: Props) {
  const [engine, setEngine] = useState<TranscriptionEngine>('deepgram');
  const [translateTo, setTranslateTo] = useState<TargetLanguage | undefined>('zh-CN');
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>('translation-only');
  const [burnSubtitles, setBurnSubtitles] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [result, setResult] = useState<{ videoUrl?: string; markdown?: string } | null>(null);

  if (!isOpen) return null;

  const handleProcess = async () => {
    if (!videoSource) return;

    setProcessing(true);
    setResult(null);

    try {
      const options: PipelineOptions = {
        transcriptionEngine: engine,
        translateTo,
        subtitleMode,
        burnSubtitles,
        generateMarkdown: true,
        preserveTechnicalTerms: true
      };

      const pipelineResult = await processVideoComplete(
        videoSource,
        options,
        setProgress
      );

      // 创建下载链接
      let videoUrl: string | undefined;
      if (pipelineResult.videoWithSubtitles) {
        videoUrl = URL.createObjectURL(pipelineResult.videoWithSubtitles);
      }

      setResult({
        videoUrl,
        markdown: pipelineResult.markdownTranscript
      });

    } catch (error) {
      console.error('[Processing] Error:', error);
      alert(error instanceof Error ? error.message : '处理失败');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">视频处理</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        {!processing && !result && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">转写引擎</label>
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value as TranscriptionEngine)}
                className="w-full p-2 border rounded"
              >
                <option value="deepgram">Deepgram（快速准确）</option>
                <option value="whisper">Whisper API</option>
                <option value="whisper-mlx">Whisper MLX（本地 GPU）</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">翻译目标语言</label>
              <select
                value={translateTo || ''}
                onChange={(e) => setTranslateTo(e.target.value as TargetLanguage || undefined)}
                className="w-full p-2 border rounded"
              >
                <option value="">不翻译（仅转写）</option>
                <option value="zh-CN">简体中文</option>
                <option value="zh-TW">繁体中文</option>
                <option value="en">英语</option>
              </select>
            </div>

            {translateTo && (
              <div>
                <label className="block text-sm font-medium mb-2">字幕模式</label>
                <select
                  value={subtitleMode}
                  onChange={(e) => setSubtitleMode(e.target.value as SubtitleMode)}
                  className="w-full p-2 border rounded"
                >
                  <option value="translation-only">仅翻译</option>
                  <option value="bilingual">双语（中文 + 原文）</option>
                </select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="burn"
                checked={burnSubtitles}
                onChange={(e) => setBurnSubtitles(e.target.checked)}
              />
              <label htmlFor="burn" className="text-sm">烧录字幕到视频</label>
            </div>

            <button
              onClick={handleProcess}
              className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
            >
              开始处理
            </button>
          </div>
        )}

        {processing && progress && (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>{progress.message}</span>
                <span>{Math.round(progress.progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
            </div>
            <div className="text-sm text-gray-600">
              当前阶段: {stageNames[progress.stage]}
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="text-green-600 font-medium">✓ 处理完成</div>

            {result.videoUrl && (
              <div>
                <a
                  href={result.videoUrl}
                  download="video-with-subtitles.mp4"
                  className="block w-full bg-blue-500 text-white text-center py-2 rounded hover:bg-blue-600"
                >
                  下载带字幕视频
                </a>
              </div>
            )}

            {result.markdown && (
              <div>
                <button
                  onClick={() => {
                    const blob = new Blob([result.markdown!], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'transcript.md';
                    a.click();
                  }}
                  className="w-full bg-gray-500 text-white py-2 rounded hover:bg-gray-600"
                >
                  下载 Markdown 文档
                </button>
              </div>
            )}

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

const stageNames: Record<PipelineProgress['stage'], string> = {
  download: '下载视频',
  'extract-audio': '提取音频',
  transcribe: '语音转写',
  translate: '翻译润色',
  burn: '烧录字幕',
  markdown: '生成文档'
};
