/**
 * Bilibili Sidebar Component
 * Renders InsightReel UI in the injected sidebar container
 */

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { FileText, Zap, Subtitles, MessageCircle, Loader, Check, AlertCircle } from 'lucide-react';
import type { VideoSource, AnalysisResult } from '../shared/types';
import '../styles/popup.css';

type AnalysisType = 'summary' | 'key-moments' | 'translation' | 'chat';

interface AnalysisState {
  summary: AnalysisResult;
  'key-moments': AnalysisResult;
  translation: AnalysisResult;
  chat: AnalysisResult;
}

function BilibiliSidebar() {
  const [videoInfo, setVideoInfo] = useState<VideoSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<AnalysisState>({
    summary: { type: 'summary', content: '', status: 'pending' },
    'key-moments': { type: 'key-moments', content: '', status: 'pending' },
    translation: { type: 'translation', content: '', status: 'pending' },
    chat: { type: 'chat', content: '', status: 'pending' },
  });

  useEffect(() => {
    // Get video info by sending message to content script
    const getVideoInfo = () => {
      try {
        chrome.runtime.sendMessage({ action: 'detectVideo' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Failed to detect video:', chrome.runtime.lastError);
            setLoading(false);
            return;
          }
          
          if (response?.videos?.[0]) {
            setVideoInfo(response.videos[0]);
          } else if (response?.hasVideo === false) {
            // No video found
            setVideoInfo(null);
          }
          setLoading(false);
        });
      } catch (error) {
        console.error('Failed to detect video:', error);
        setLoading(false);
      }
    };

    // Wait a bit for content script to be ready
    setTimeout(getVideoInfo, 500);
  }, []);

  const handleAnalyze = async (analysisType: AnalysisType) => {
    if (!videoInfo) return;

    setResults((prev) => ({
      ...prev,
      [analysisType]: {
        ...prev[analysisType],
        status: 'processing',
      },
    }));

    try {
      chrome.runtime.sendMessage(
        {
          action: 'startProcessing',
          videoUrl: videoInfo.url,
          analysisType,
        },
        (response) => {
          if (response?.taskId) {
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

  const analysisOptions = [
    {
      id: 'summary' as AnalysisType,
      label: 'Summary',
      icon: <FileText className="w-4 h-4" />,
      description: 'Get key points',
    },
    {
      id: 'key-moments' as AnalysisType,
      label: 'Key Moments',
      icon: <Zap className="w-4 h-4" />,
      description: 'Find highlights',
    },
    {
      id: 'translation' as AnalysisType,
      label: 'Translate',
      icon: <Subtitles className="w-4 h-4" />,
      description: 'Multi-language',
    },
    {
      id: 'chat' as AnalysisType,
      label: 'Chat',
      icon: <MessageCircle className="w-4 h-4" />,
      description: 'Ask questions',
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader className="w-6 h-6 text-emerald-600 animate-spin" />
        <p className="text-xs text-gray-600">Detecting video...</p>
      </div>
    );
  }

  if (!videoInfo) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <AlertCircle className="w-8 h-8 text-amber-500" />
        <p className="text-xs text-gray-600 text-center">No video found on this page</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-4">
      {/* Video Info */}
      <div className="p-3 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl border border-emerald-200">
        <p className="text-xs font-medium text-emerald-900 truncate">{videoInfo.title || 'Video'}</p>
        <p className="text-xs text-emerald-700 mt-1 capitalize">{videoInfo.provider}</p>
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

// Mount React app when container is ready
function mountBilibiliSidebar() {
  const container = document.getElementById('insightreel-sidebar-root');
  if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(<BilibiliSidebar />);
  } else {
    // Retry after a short delay
    setTimeout(mountBilibiliSidebar, 100);
  }
}

// Listen for the ready event
window.addEventListener('insightreel-sidebar-ready', mountBilibiliSidebar);

// Also try to mount immediately if container already exists
if (document.getElementById('insightreel-sidebar-root')) {
  mountBilibiliSidebar();
}

export default BilibiliSidebar;

