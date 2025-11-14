import React, { useState } from 'react';
import { FileText, Zap, Subtitles, MessageCircle, Loader, Check, AlertCircle } from 'lucide-react';
import type { VideoSource, AnalysisResult } from '../../shared/types';

interface AnalysisPanelProps {
  video: VideoSource & { pageTitle: string; pageUrl: string };
  onClose: () => void;
}

type AnalysisType = 'summary' | 'key-moments' | 'translation' | 'chat';

interface AnalysisState {
  summary: AnalysisResult;
  'key-moments': AnalysisResult;
  translation: AnalysisResult;
  chat: AnalysisResult;
}

const analysisOptions: Array<{
  id: AnalysisType;
  label: string;
  icon: React.ReactNode;
  description: string;
}> = [
  {
    id: 'summary',
    label: 'Summary',
    icon: <FileText className="w-4 h-4" />,
    description: 'Get key points',
  },
  {
    id: 'key-moments',
    label: 'Key Moments',
    icon: <Zap className="w-4 h-4" />,
    description: 'Find highlights',
  },
  {
    id: 'translation',
    label: 'Translate',
    icon: <Subtitles className="w-4 h-4" />,
    description: 'Multi-language',
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: <MessageCircle className="w-4 h-4" />,
    description: 'Ask questions',
  },
];

export default function AnalysisPanel({ video, onClose }: AnalysisPanelProps) {
  const [results, setResults] = useState<AnalysisState>({
    summary: { type: 'summary', content: '', status: 'pending' },
    'key-moments': { type: 'key-moments', content: '', status: 'pending' },
    translation: { type: 'translation', content: '', status: 'pending' },
    chat: { type: 'chat', content: '', status: 'pending' },
  });

  const handleAnalyze = async (analysisType: AnalysisType) => {
    // Update status to processing
    setResults((prev) => ({
      ...prev,
      [analysisType]: {
        ...prev[analysisType],
        status: 'processing',
      },
    }));

    try {
      // Send message to background script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab');

      chrome.runtime.sendMessage(
        {
          action: 'startProcessing',
          videoUrl: video.url,
          analysisType,
        },
        (response) => {
          if (response?.status === 'processing') {
            // Wait for completion
            const checkCompletion = () => {
              chrome.runtime.sendMessage(
                { action: 'getTaskStatus', taskId: response.taskId },
                (task) => {
                  if (task.status === 'completed') {
                    setResults((prev) => ({
                      ...prev,
                      [analysisType]: {
                        ...prev[analysisType],
                        status: 'completed',
                        content: task.result,
                      },
                    }));
                  } else if (task.status === 'error') {
                    setResults((prev) => ({
                      ...prev,
                      [analysisType]: {
                        ...prev[analysisType],
                        status: 'error',
                        error: task.error,
                      },
                    }));
                  } else {
                    setTimeout(checkCompletion, 500);
                  }
                }
              );
            };
            checkCompletion();
          }
        }
      );
    } catch (error) {
      setResults((prev) => ({
        ...prev,
        [analysisType]: {
          ...prev[analysisType],
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }));
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <Loader className="w-4 h-4 text-emerald-600 animate-spin" />;
      case 'completed':
        return <Check className="w-4 h-4 text-emerald-600" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3 pb-4">
      {/* Video Info */}
      <div className="p-3 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl border border-emerald-200">
        <p className="text-xs font-medium text-emerald-900">{video.title || 'Video'}</p>
        <p className="text-xs text-emerald-700 mt-1 truncate">{video.provider}</p>
        <div className="mt-3 space-y-1">
          {video.subtitles && video.subtitles.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-emerald-800">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-1 font-semibold">
                <Subtitles className="w-3 h-3" />
                {video.subtitles.length} subtitle track
                {video.subtitles.length > 1 ? 's' : ''}
              </span>
              {video.subtitles.slice(0, 5).map((track, idx) => (
                <span
                  key={`${track.language}-${idx}`}
                  className="rounded-full bg-white/80 px-2 py-1 font-medium text-emerald-700"
                >
                  {track.label || track.language?.toUpperCase() || 'Subtitle'}
                </span>
              ))}
            </div>
          ) : video.hasSubtitles === false ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-1 text-[10px] font-medium text-emerald-700">
              <Subtitles className="w-3 h-3" />
              No subtitles detected
            </span>
          ) : null}
        </div>
      </div>

      {/* Analysis Options */}
      <div className="grid grid-cols-2 gap-2">
        {analysisOptions.map((option) => {
          const result = results[option.id];
          const isProcessing = result.status === 'processing';
          const isCompleted = result.status === 'completed';

          return (
            <button
              key={option.id}
              onClick={() => handleAnalyze(option.id)}
              disabled={isProcessing}
              className={`p-3 rounded-xl border transition-all text-left group ${
                isCompleted
                  ? 'bg-emerald-50 border-emerald-300'
                  : 'bg-white border-gray-200 hover:border-emerald-300 hover:shadow-sm'
              } ${isProcessing ? 'opacity-75' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className={`${isCompleted ? 'text-emerald-600' : 'text-gray-600'}`}>
                  {option.icon}
                </div>
                {getStatusIcon(result.status)}
              </div>
              <p className="text-xs font-medium text-gray-900">{option.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
            </button>
          );
        })}
      </div>

      {/* Results */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {Object.entries(results).map(([key, result]) => {
          if (result.status === 'pending') return null;

          return (
            <div
              key={key}
              className="p-3 bg-white rounded-xl border border-gray-200"
            >
              <div className="flex items-center gap-2 mb-2">
                {analysisOptions.find((o) => o.id === key)?.icon}
                <p className="text-xs font-medium text-gray-900">
                  {analysisOptions.find((o) => o.id === key)?.label}
                </p>
              </div>

              {result.status === 'processing' ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader className="w-4 h-4 text-emerald-600 animate-spin" />
                  <p className="text-xs text-gray-500">Processing...</p>
                </div>
              ) : result.status === 'error' ? (
                <p className="text-xs text-red-500">{result.error}</p>
              ) : (
                <p className="text-xs text-gray-700 leading-relaxed line-clamp-4">
                  {result.content}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
