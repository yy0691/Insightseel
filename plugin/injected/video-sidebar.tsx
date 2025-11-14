/**
 * Universal Video Sidebar Component
 * Renders InsightReel UI with multiple tabs (InsightReel, Insights, Chat)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { FileText, Zap, Subtitles, MessageCircle, Loader, Check, AlertCircle, Send } from 'lucide-react';
import type { VideoSource, AnalysisResult } from '../shared/types';
import '../styles/popup.css';

// Chat Interface Component
function ChatInterface({ 
  messages, 
  input, 
  onInputChange, 
  onSend 
}: { 
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full" style={{ height: 'calc(100vh - 60px)' }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
            <MessageCircle className="w-12 h-12 mb-3 text-gray-400" />
            <p className="text-sm font-medium mb-1">开始对话</p>
            <p className="text-xs text-gray-400">询问关于这个视频的任何问题</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-4 py-3 rounded-xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="border-t border-gray-200 p-4 bg-white sticky bottom-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="输入问题..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          <button
            onClick={onSend}
            disabled={!input.trim()}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            发送
          </button>
        </div>
      </div>
    </div>
  );
}

type AnalysisType = 'summary' | 'key-moments' | 'translation' | 'chat';

interface AnalysisState {
  summary: AnalysisResult;
  'key-moments': AnalysisResult;
  translation: AnalysisResult;
  chat: AnalysisResult;
}

function VideoSidebar() {
  const [videoInfo, setVideoInfo] = useState<VideoSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<AnalysisState>({
    summary: { type: 'summary', content: '', status: 'pending' },
    'key-moments': { type: 'key-moments', content: '', status: 'pending' },
    translation: { type: 'translation', content: '', status: 'pending' },
    chat: { type: 'chat', content: '', status: 'pending' },
  });
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');

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
            setVideoInfo(null);
          }
          setLoading(false);
        });
      } catch (error) {
        console.error('Failed to detect video:', error);
        setLoading(false);
      }
    };

    setTimeout(getVideoInfo, 500);
  }, []);

  // Update insights and chat containers when results change
  useEffect(() => {
    updateInsightsContainer();
  }, [results]);

  const updateInsightsContainer = () => {
    const insightsContainer = document.getElementById('insightreel-insights');
    if (insightsContainer) {
      const completedResults = Object.entries(results).filter(([_, result]) => result.status === 'completed');
      
      if (completedResults.length === 0) {
        insightsContainer.innerHTML = `
          <div style="text-align: center; padding: 40px 20px; color: #6b7280;">
            <p style="font-size: 14px; margin-bottom: 8px;">还没有分析结果</p>
            <p style="font-size: 12px; color: #9ca3af;">请在 InsightReel 选项卡中开始分析</p>
          </div>
        `;
      } else {
        insightsContainer.innerHTML = completedResults.map(([key, result]) => {
          const labels: Record<string, string> = {
            'summary': '摘要',
            'key-moments': '关键时刻',
            'translation': '翻译',
            'chat': '聊天',
          };
          return `
            <div style="margin-bottom: 16px; padding: 16px; background: white; border-radius: 12px; border: 1px solid #e5e7eb;">
              <h3 style="font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 8px;">
                ${labels[key] || key}
              </h3>
              <p style="font-size: 13px; color: #374151; line-height: 1.6;">
                ${result.content}
              </p>
            </div>
          `;
        }).join('');
      }
    }
  };

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

  const handleChatSend = useCallback(async () => {
    if (!chatInput.trim() || !videoInfo) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      chrome.runtime.sendMessage(
        {
          action: 'startProcessing',
          videoUrl: videoInfo.url,
          analysisType: 'chat',
          question: userMessage,
        },
        (response) => {
          if (response?.taskId) {
            const checkCompletion = () => {
              chrome.runtime.sendMessage(
                { action: 'getTaskStatus', taskId: response.taskId },
                (task) => {
                  if (task.status === 'completed') {
                    const assistantMessage = { role: 'assistant' as const, content: task.result };
                    setChatMessages(prev => [...prev, assistantMessage]);
                  } else if (task.status === 'error') {
                    const errorMessage = { role: 'assistant' as const, content: `错误: ${task.error}` };
                    setChatMessages(prev => [...prev, errorMessage]);
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
      const errorMessage = { role: 'assistant' as const, content: `错误: ${error instanceof Error ? error.message : 'Unknown error'}` };
      setChatMessages(prev => [...prev, errorMessage]);
    }
  }, [chatInput, videoInfo]);

  // Render chat component separately
  useEffect(() => {
    const chatContainer = document.getElementById('insightreel-chat');
    if (chatContainer) {
      const chatRoot = ReactDOM.createRoot(chatContainer);
      chatRoot.render(
        <ChatInterface 
          messages={chatMessages}
          input={chatInput}
          onInputChange={setChatInput}
          onSend={handleChatSend}
        />
      );
    }
  }, [chatMessages, chatInput, handleChatSend]);

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
function mountVideoSidebar() {
  const container = document.getElementById('insightreel-sidebar-root');
  if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(<VideoSidebar />);
    
    // Initialize chat container
    // Chat container will be rendered by useEffect
  } else {
    setTimeout(mountVideoSidebar, 100);
  }
}

// Listen for the ready event
window.addEventListener('insightreel-sidebar-ready', mountVideoSidebar);

// Also try to mount immediately if container already exists
if (document.getElementById('insightreel-sidebar-root')) {
  mountVideoSidebar();
}

export default VideoSidebar;

