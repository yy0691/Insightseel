import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Video, Note } from '../types';
import { noteDB } from '../services/dbService';
import { downloadFile, formatTimestamp } from '../utils/helpers';
import { useLanguage } from '../contexts/LanguageContext';
import { Download, ChevronDown, ChevronUp, Trash2, Plus, CheckCircle2, Loader2, Eye, Edit } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';

const useDebouncedCallback = (callback: (...args: any[]) => void, delay: number) => {
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const debouncedCallback = useCallback((...args: any[]) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);

  return debouncedCallback;
};


interface NotesPanelProps {
  video: Video;
  note: Note | null;
  currentTime?: number; // 当前视频播放时间（秒）
  onSeekTo?: (timeInSeconds: number) => void; // 跳转到指定时间
}

const NotesPanel: React.FC<NotesPanelProps> = ({ video, note, currentTime = 0, onSeekTo }) => {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'idle' | 'typing' | 'saving' | 'saved'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [hasScrolled, setHasScrolled] = useState({ top: false, bottom: false });
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const { t, language } = useLanguage();

  useEffect(() => {
    setContent(note?.content || '');
    setLastSaved(note ? new Date(note.updatedAt) : null);
    setStatus('idle');
  }, [video.id, note]);

  // 显示排版提示（仅在第一次输入时）
  useEffect(() => {
    if (status === 'typing' && content.length === 1 && !showTip) {
      setShowTip(true);
      const timer = setTimeout(() => setShowTip(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [status, content.length, showTip]);

  // 保存后自动隐藏 saved 状态
  useEffect(() => {
    if (status === 'saved') {
      const timer = setTimeout(() => {
        setStatus('idle');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const saveNote = useCallback(async (newContent: string) => {
      setStatus('saving');
      try {
          const newNote: Note = {
            id: video.id,
            videoId: video.id,
            content: newContent,
            updatedAt: new Date().toISOString(),
          };
          await noteDB.put(newNote);
          setStatus('saved');
          setLastSaved(new Date(newNote.updatedAt));
      } catch (error) {
          console.error('Failed to save note:', error);
          setStatus('idle');
      }
  }, [video.id]);

  const debouncedSave = useDebouncedCallback(saveNote, 1000);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = e.target.value;
      setContent(newContent);
      setStatus('typing');
      debouncedSave(newContent);
  };

  const handleExport = () => {
    const fileName = `${video.name.replace(/\.[^/.]+$/, "")}-notes.txt`;
    downloadFile(content, fileName, 'text/plain');
  };

  const handleClear = () => {
    if (window.confirm(language === 'zh' ? '确定要清空所有笔记吗？' : 'Are you sure you want to clear all notes?')) {
      setContent('');
      setStatus('typing');
      debouncedSave('');
    }
  };

  const handleAddTimestampNote = () => {
    // 使用当前视频播放时间
    // formatTimestamp 返回 HH:MM:SS 格式
    // MarkdownRenderer 支持 [HH:MM:SS] 和 [MM:SS] 两种格式
    let timestampStr: string;
    if (currentTime < 3600) {
      // 如果小于1小时，使用 MM:SS 格式（去掉小时部分）
      const minutes = Math.floor(currentTime / 60);
      const seconds = Math.floor(currentTime % 60);
      timestampStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      // 如果大于等于1小时，使用 HH:MM:SS 格式
      timestampStr = formatTimestamp(currentTime);
    }
    const newContent = content ? `${content}\n\n[${timestampStr}] ` : `[${timestampStr}] `;
    setContent(newContent);
    setStatus('typing');
    debouncedSave(newContent);
    textareaRef.current?.focus();
    // 移动光标到末尾
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.setSelectionRange(newContent.length, newContent.length);
      }
    }, 0);
  };

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = target;
    setHasScrolled({
      top: scrollTop > 10,
      bottom: scrollTop + clientHeight < scrollHeight - 10
    });
  };

  const getStatusText = () => {
      switch (status) {
          case 'typing':
              return t('statusTyping');
          case 'saving':
              return t('statusSaving');
          case 'saved':
              return t('statusSaved');
          case 'idle':
              return lastSaved ? t('statusLastSaved', lastSaved.toLocaleTimeString()) : t('statusReady');
      }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'typing':
        return (
          <span className="flex items-center gap-0.5">
            <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
            <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
            <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
          </span>
        );
      case 'saving':
        return <Loader2 className="w-3 h-3 text-slate-500 animate-spin" />;
      case 'saved':
        return <CheckCircle2 className="w-3 h-3 text-emerald-500 animate-pulse" />;
      default:
        return null;
    }
  };

  // 计算进度条宽度和颜色
  const getProgressBarStyle = () => {
    switch (status) {
      case 'typing':
        return { width: '30%', backgroundColor: 'rgb(148, 163, 184)', opacity: 0.5 };
      case 'saving':
        return { width: '100%', backgroundColor: 'rgb(59, 130, 246)', opacity: 1 };
      case 'saved':
        return { width: '100%', backgroundColor: 'rgb(16, 185, 129)', opacity: 0 };
      default:
        return { width: '0%', backgroundColor: 'transparent', opacity: 0 };
    }
  };

  if (isCollapsed) {
    return (
      <div className="flex flex-col flex-1 rounded-3xl bg-white/70 shadow-sm backdrop-blur-md p-4">
        <button
          onClick={() => setIsCollapsed(false)}
          className="flex items-center justify-between w-full text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          <span>{t('notes') || 'Notes'}</span>
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="flex flex-col flex-1 rounded-3xl bg-white/70 shadow-sm backdrop-blur-md p-4 transition-shadow duration-300"
      style={{
        boxShadow: status === 'typing' 
          ? '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
          : '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
      }}
    >
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <p className="text-xs text-slate-500">
            {getStatusText()}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {/* 预览/编辑切换按钮 */}
          <button
            onClick={() => setIsPreviewMode(!isPreviewMode)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-slate-600 bg-white/60 border border-slate-200 rounded-xl hover:bg-white transition-colors"
            title={isPreviewMode 
              ? (language === 'zh' ? '切换到编辑模式' : 'Switch to edit mode')
              : (language === 'zh' ? '切换到预览模式' : 'Switch to preview mode')
            }
          >
            {isPreviewMode ? (
              <>
                <Edit className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{language === 'zh' ? '编辑' : 'Edit'}</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{language === 'zh' ? '预览' : 'Preview'}</span>
              </>
            )}
          </button>
          {/* 添加时间戳笔记按钮（仅在编辑模式显示） */}
          {!isPreviewMode && (
            <button
              onClick={handleAddTimestampNote}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-slate-600 bg-white/60 border border-slate-200 rounded-xl hover:bg-white transition-colors"
              title={language === 'zh' ? `添加当前时间戳笔记 (${formatTimestamp(currentTime)})` : `Add timestamped note (${formatTimestamp(currentTime)})`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{language === 'zh' ? '时间戳' : 'Timestamp'}</span>
            </button>
          )}
          {/* 折叠按钮 */}
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 text-slate-600 bg-white/60 border border-slate-200 rounded-xl hover:bg-white transition-colors"
            title={language === 'zh' ? '折叠笔记' : 'Collapse notes'}
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          {/* 清空按钮 */}
          <button
            onClick={handleClear}
            disabled={!content}
            className="p-1.5 text-slate-600 bg-white/60 border border-slate-200 rounded-xl hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={language === 'zh' ? '清空笔记' : 'Clear notes'}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {/* 导出按钮 */}
          <button
            onClick={handleExport}
            disabled={!content}
            className="p-1.5 text-slate-600 bg-white/60 border border-slate-200 rounded-xl hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('exportNotes')}
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 自动保存进度条 */}
      <div className="flex-shrink-0 h-0.5 bg-slate-100 rounded-full mb-3 overflow-hidden">
        <div
          className="h-full transition-all duration-500 ease-out"
          style={getProgressBarStyle()}
        />
      </div>

      {/* 文本排版提示气泡 */}
      {showTip && (
        <div className="absolute top-16 right-4 z-10 px-3 py-1.5 bg-slate-800/90 text-white text-[11px] rounded-2xl shadow-lg opacity-0 animate-[fadeIn_0.3s_ease-out_forwards]">
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(-4px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          {language === 'zh' 
            ? '输入双回车可分段 · 输入 `-` 可创建项目符号'
            : 'Double Enter to paragraph · Use `-` for bullet points'}
        </div>
      )}

      {/* 笔记内容区 */}
      <div className="flex-1 relative min-h-0">
        {isPreviewMode ? (
          /* 预览模式：渲染 Markdown */
          <div 
            ref={previewContainerRef}
            className="w-full h-full bg-slate-50/60 rounded-2xl p-4 text-[12px] leading-7 font-normal text-slate-800 ring-1 ring-slate-200 overflow-y-auto custom-scrollbar"
            onScroll={(e) => {
              const target = e.currentTarget;
              const { scrollTop, scrollHeight, clientHeight } = target;
              setHasScrolled({
                top: scrollTop > 10,
                bottom: scrollTop + clientHeight < scrollHeight - 10
              });
            }}
          >
            {/* 滚动边缘光晕 */}
            {hasScrolled.top && (
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-b from-slate-50/80 to-transparent pointer-events-none z-10" />
            )}
            {hasScrolled.bottom && (
              <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-t from-slate-50/80 to-transparent pointer-events-none z-10" />
            )}
            {content ? (
              <MarkdownRenderer 
                content={content} 
                onTimestampClick={onSeekTo}
              />
            ) : (
              <p className="text-slate-400 italic">{t('notesPlaceholder')}</p>
            )}
          </div>
        ) : (
          /* 编辑模式：textarea */
          <>
            {/* 滚动边缘光晕 */}
            {hasScrolled.top && (
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-b from-slate-50/80 to-transparent pointer-events-none z-10" />
            )}
            {hasScrolled.bottom && (
              <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-t from-slate-50/80 to-transparent pointer-events-none z-10" />
            )}

            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleChange}
              onScroll={handleScroll}
              placeholder={t('notesPlaceholder')}
              className="w-full h-full bg-slate-50/60 rounded-2xl p-4 text-[12px] leading-7 font-normal text-slate-800 ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-400 focus:outline-none transition-all resize-none custom-scrollbar"
              style={{
                caretColor: 'rgb(51, 65, 85)',
              }}
              aria-label="Video notes"
            />
          </>
        )}
      </div>
    </div>
  );
};

export default NotesPanel;