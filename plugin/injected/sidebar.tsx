/**
 * Injected Sidebar Component
 * Can be embedded directly into web pages via content script
 */

import React, { useState, useEffect } from 'react';
import { X, ChevronDown, Loader } from 'lucide-react';
import type { VideoSource, AnalysisResult } from '../shared/types';

interface SidebarProps {
  onClose: () => void;
}

type AnalysisType = 'summary' | 'key-moments' | 'translation' | 'chat';

interface AnalysisState {
  summary: AnalysisResult;
  'key-moments': AnalysisResult;
  translation: AnalysisResult;
  chat: AnalysisResult;
}

export default function Sidebar({ onClose }: SidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [videoInfo, setVideoInfo] = useState<VideoSource | null>(null);
  const [results, setResults] = useState<AnalysisState>({
    summary: { type: 'summary', content: '', status: 'pending' },
    'key-moments': { type: 'key-moments', content: '', status: 'pending' },
    translation: { type: 'translation', content: '', status: 'pending' },
    chat: { type: 'chat', content: '', status: 'pending' },
  });

  useEffect(() => {
    // Detect video on page
    chrome.runtime.sendMessage({ action: 'detectVideo' }, (response) => {
      if (response?.videos?.[0]) {
        setVideoInfo(response.videos[0]);
      }
    });
  }, []);

  const handleAnalyze = async (type: AnalysisType) => {
    if (!videoInfo) return;

    setResults((prev) => ({
      ...prev,
      [type]: { ...prev[type], status: 'processing' },
    }));

    chrome.runtime.sendMessage(
      {
        action: 'startProcessing',
        videoUrl: videoInfo.url,
        analysisType: type,
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
                    [type]: {
                      ...prev[type],
                      status: 'completed',
                      content: task.result,
                    },
                  }));
                } else if (task.status === 'error') {
                  setResults((prev) => ({
                    ...prev,
                    [type]: {
                      ...prev[type],
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
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="fixed bottom-4 right-4 w-12 h-12 bg-emerald-600 text-white rounded-full shadow-lg hover:bg-emerald-700 transition-colors flex items-center justify-center z-[999999]"
        title="Open InsightReel"
      >
        <span className="text-xl">🔍</span>
      </button>
    );
  }

  return (
    <div className="fixed right-0 top-0 h-screen w-96 bg-white border-l border-gray-200 shadow-lg z-[999999] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-gradient-to-r from-emerald-50 to-emerald-100 border-b border-emerald-200 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-emerald-600 rounded-md"></div>
          <h2 className="font-semibold text-gray-900">InsightReel</h2>
        </div>
        <button
          onClick={() => setIsExpanded(false)}
          className="p-1 hover:bg-white rounded-lg transition-colors"
        >
          <ChevronDown className="w-5 h-5 text-gray-600" />
        </button>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!videoInfo ? (
          <div className="flex items-center justify-center py-8">
            <Loader className="w-5 h-5 text-emerald-600 animate-spin" />
          </div>
        ) : (
          <>
            {/* Video Info */}
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
              <p className="text-sm font-medium text-emerald-900">{videoInfo.title}</p>
              <p className="text-xs text-emerald-700 mt-1">{videoInfo.provider}</p>
            </div>

            {/* Analysis Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleAnalyze('summary')}
                disabled={results.summary.status === 'processing'}
                className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                Summary
              </button>
              <button
                onClick={() => handleAnalyze('key-moments')}
                disabled={results['key-moments'].status === 'processing'}
                className="p-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                Highlights
              </button>
              <button
                onClick={() => handleAnalyze('translation')}
                disabled={results.translation.status === 'processing'}
                className="p-2 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                Translate
              </button>
              <button
                onClick={() => handleAnalyze('chat')}
                disabled={results.chat.status === 'processing'}
                className="p-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                Ask
              </button>
            </div>

            {/* Results */}
            <div className="space-y-2">
              {Object.entries(results).map(([key, result]) => {
                if (result.status === 'pending') return null;

                return (
                  <div key={key} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-xs font-semibold text-gray-700 capitalize mb-1">
                      {key.replace('-', ' ')}
                    </p>
                    {result.status === 'processing' ? (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Loader className="w-3 h-3 animate-spin" />
                        Processing...
                      </div>
                    ) : result.status === 'error' ? (
                      <p className="text-xs text-red-600">{result.error}</p>
                    ) : (
                      <p className="text-xs text-gray-700 line-clamp-3">
                        {result.content}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 p-4 bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          Powered by InsightReel AI
        </p>
      </div>
    </div>
  );
}
