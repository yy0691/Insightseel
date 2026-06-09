import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Video, Subtitles, Analysis, AnalysisType, Note, SubtitleDisplayMode } from '../types';

// ── Subtitle style customisation ─────────────────────────────────────────────
interface SubtitleStyle {
  fontSize: number;       // px
  textColor: string;      // hex
  bgOpacity: number;      // 0-100
  posX: number;           // % from left of container (0-100)
  posY: number;           // % from top of container (0-100)
}
const SUBTITLE_STYLE_KEY = 'subtitle-style-prefs';
const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontSize: 16, textColor: '#ffffff', bgOpacity: 75,
  posX: 50, posY: 85,
};
const loadSubtitleStyle = (): SubtitleStyle => {
  try {
    const raw = localStorage.getItem(SUBTITLE_STYLE_KEY);
    if (raw) return { ...DEFAULT_SUBTITLE_STYLE, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SUBTITLE_STYLE };
};
const SUBTITLE_FONT_SIZES = [13, 16, 20, 26] as const;
const SUBTITLE_COLORS = [
  { label: 'White',  value: '#ffffff' },
  { label: 'Yellow', value: '#fde047' },
  { label: 'Cyan',   value: '#67e8f9' },
  { label: 'Lime',   value: '#86efac' },
] as const;
const SUBTITLE_BG_OPACITIES = [
  { label: 'Off',  value: 0  },
  { label: '30%',  value: 30 },
  { label: '60%',  value: 60 },
  { label: '90%',  value: 90 },
] as const;
// ─────────────────────────────────────────────────────────────────────────────
import { parseSubtitleFile, formatTimestamp, parseSrt, segmentsToSrt, downloadFile, parseTimestampToSeconds } from '../utils/helpers';
import { subtitleDB } from '../services/dbService';
import { saveSubtitles } from '../services/subtitleService';
import { translateSubtitles as translateSubtitlesLegacy } from '../services/geminiService';
import { translateSubtitles, detectSubtitleLanguage, isTraditionalChinese } from '../services/translationService';
import type { TranslationOptions } from '../services/translationService';
import { generateVideoHash, clearVideoCache } from '../services/cacheService';
import { generateResilientSubtitles, generateResilientInsights } from '../services/videoProcessingService';
import { isSegmentedProcessingAvailable } from '../services/segmentedProcessor';
import { isDeepgramAvailable, estimateDeepgramProcessingTime } from '../services/deepgramService';
import { toast } from '../hooks/useToastStore';
import { BaseModal } from './ui/BaseModal';
import { GenerationLogPanel, type LogEntry, type LogLevel } from './ui/GenerationLogPanel';
import { classifyError } from '../services/errorClassifier';
import { getErrorDisplay } from '../utils/errorMessages';
import {
  recordGenerationStart,
  recordSegmentComplete,
  clearGenerationProgress,
  getGenerationProgress,
} from '../services/generationProgressStore';
import {
  saveBenchmarkRecord,
  readPeakMemoryMB,
  type BenchmarkRecord,
} from '../services/benchmarkService';

import ChatPanel from './ChatPanel';
import NotesPanel from './NotesPanel';
import { useLanguage } from '../contexts/LanguageContext';
import MarkdownRenderer from './MarkdownRenderer';



interface VideoDetailProps {
  video: Video;
  subtitles: Subtitles | null;
  analyses: Analysis[];
  note: Note | null;
  onAnalysesChange: (videoId: string) => void;
  onSubtitlesChange: (videoId: string) => void;
  onDeleteVideo: (videoId: string) => void;
  onFirstInsightGenerated: () => void;
}

type TabType = 'KeyMoments' | 'Insights' | 'Chat' | 'Notes';

const HEATMAP_COLORS = [
  'bg-sky-400', 'bg-lime-400', 'bg-amber-400', 'bg-violet-400', 'bg-rose-400',
  'bg-teal-400', 'bg-orange-400', 'bg-fuchsia-400'
];

const GEMINI_TIMEOUT_HINT_MIN = 20; // 超过此时长且无 Deepgram/FFmpeg 时给出提示

const getProcessingEstimate = (durationMinutes: number) => {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return { min: 0.5, max: 1 };
  }

  const minEstimate = Math.max(0.5, durationMinutes / 3);
  const maxEstimate = Math.max(minEstimate + 0.5, durationMinutes / 2);

  return { min: minEstimate, max: maxEstimate };
};

const formatProcessingEstimate = ({ min, max }: { min: number; max: number }) => {
  const formatValue = (value: number) => {
    if (value >= 3) {
      return Math.round(value).toString();
    }

    if (value >= 1) {
      return value.toFixed(1);
    }

    return value.toFixed(2);
  };

  return `${formatValue(min)}-${formatValue(max)} minutes`;
};

const getYouTubeEmbedUrl = (url?: string, startSeconds?: number): string => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const videoId = parsed.hostname.includes('youtu.be')
      ? parsed.pathname.split('/').filter(Boolean)[0]
      : parsed.pathname.startsWith('/shorts/')
        ? parsed.pathname.split('/').filter(Boolean)[1]
        : parsed.searchParams.get('v');

    if (!videoId) return url;

    const embed = new URL(`https://www.youtube.com/embed/${videoId}`);
    embed.searchParams.set('rel', '0');
    if (startSeconds && startSeconds > 0) {
      embed.searchParams.set('start', Math.floor(startSeconds).toString());
    }
    return embed.toString();
  } catch {
    return url;
  }
};

const VideoDetail: React.FC<VideoDetailProps> = ({ video, subtitles, analyses, note, onAnalysesChange, onSubtitlesChange, onDeleteVideo, onFirstInsightGenerated }) => {
  const [videoUrl, setVideoUrl] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('Insights');
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPipOpen, setIsPipOpen] = useState(false);
  const pipWindowRef = useRef<Window | null>(null);
  const pipSubtitleRef = useRef<HTMLDivElement | null>(null);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [showSubtitleOverlay, setShowSubtitleOverlay] = useState(true);
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(loadSubtitleStyle);
  const subtitleSettingsRef = useRef<HTMLDivElement>(null);
  const isDraggingSubtitle = useRef(false);
  const { t, language } = useLanguage();

  // Persist subtitle style (including position) changes
  useEffect(() => {
    localStorage.setItem(SUBTITLE_STYLE_KEY, JSON.stringify(subtitleStyle));
  }, [subtitleStyle]);

  // Close subtitle settings popover on outside click
  useEffect(() => {
    if (!showSubtitleSettings) return;
    const handler = (e: MouseEvent) => {
      if (subtitleSettingsRef.current && !subtitleSettingsRef.current.contains(e.target as Node)) {
        setShowSubtitleSettings(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSubtitleSettings]);

  // Subtitle drag: mousemove/mouseup on document while dragging
  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!isDraggingSubtitle.current || !videoContainerRef.current) return;
      const rect = videoContainerRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const newX = Math.max(5, Math.min(95, ((clientX - rect.left) / rect.width) * 100));
      const newY = Math.max(5, Math.min(88, ((clientY - rect.top) / rect.height) * 100));
      setSubtitleStyle(s => ({ ...s, posX: newX, posY: newY }));
    };
    const onUp = () => { isDraggingSubtitle.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove);
    document.addEventListener('touchend', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
  }, []);

  // 🔍 调试：检查传入组件的字幕数据
  useEffect(() => {
    if (subtitles && subtitles.segments.length > 0) {
      console.log('===== VideoDetail 组件接收到的字幕 =====');
      console.log('字幕片段数:', subtitles.segments.length);
      console.log('第1条字幕:');
      console.log('  文本:', subtitles.segments[0].text);
      console.log('  文本长度:', subtitles.segments[0].text.length);
      console.log('  字符编码:', Array.from(subtitles.segments[0].text.substring(0, 20)).map(c => c.charCodeAt(0)));
      console.log('  类型:', typeof subtitles.segments[0].text);
    }
  }, [subtitles]);

  const activeSegmentRef = useRef<HTMLButtonElement>(null);
  const subtitleContainerRef = useRef<HTMLDivElement>(null);
  const [isGeneratingSubtitles, setIsGeneratingSubtitles] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [displayMode, setDisplayMode] = useState<SubtitleDisplayMode>('original');
  const userClickedRef = useRef(false);
  const isInitialMountRef = useRef(true);
  const [clickedSegmentIndex, setClickedSegmentIndex] = useState<number | null>(null);
  const [showTranslationLanguageModal, setShowTranslationLanguageModal] = useState(false);
  const [isTranslationFromUser, setIsTranslationFromUser] = useState(false);
  const [showSubtitleLanguageModal, setShowSubtitleLanguageModal] = useState(false);
  const [showRegenerateConfirmModal, setShowRegenerateConfirmModal] = useState(false);
  const [selectedVideoLanguage, setSelectedVideoLanguage] = useState<string | null>(null);

  const [generationStatus, setGenerationStatus] = useState({ active: false, stage: '', progress: 0 });
  const [segmentStatus, setSegmentStatus] = useState<{ completed: number; total: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const benchmarkStartRef = useRef<{ startedAt: number; peakMemoryMB: number | null } | null>(null);
  const [streamingSubtitles, setStreamingSubtitles] = useState(''); // For real-time subtitle display
  const [videoHash, setVideoHash] = useState<string>(''); // Video hash for caching
  const [segmentedAvailable, setSegmentedAvailable] = useState(false);

  // Confirm-modal state (async await pattern)
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    resolve: (ok: boolean) => void;
  } | null>(null);

  // Recovery prompt for interrupted long-video generation
  const [recoveryModal, setRecoveryModal] = useState<{
    open: boolean;
    completedSegments: number;
    totalSegments: number;
    language: string;
  } | null>(null);
  const summaryAnalysis = analyses.find(a => a.type === 'summary');
  const topicsAnalysis = analyses.find(a => a.type === 'topics');
  const keyInfoAnalysis = analyses.find(a => a.type === 'key-info');
  const [activeTopic, setActiveTopic] = useState<string | null>(null);

  // Promise-based confirm dialog — replaces window.confirm inside async handlers
  const showConfirmAsync = (
    title: string,
    message: string,
    confirmLabel?: string,
  ): Promise<boolean> =>
    new Promise((resolve) => {
      setConfirmModal({ title, message, confirmLabel, resolve });
    });

  // Generation log panel
  const [genLogs, setGenLogs] = useState<LogEntry[]>([]);
  const addLog = React.useCallback((msg: string, level: LogLevel = 'info') => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setGenLogs(prev => [...prev.slice(-150), { id: Date.now() + Math.random(), ts, level, msg }]);
  }, []);

  // Re-translate modal: shown when user triggers translation but subtitles are already (partially) translated
  const [retranslateModal, setRetranslateModal] = useState<{
    open: boolean;
    targetLang: 'zh-CN' | 'zh-TW' | 'en';
    hasPartial: boolean; // true = partial, false = fully translated
  } | null>(null);

  // Intercept native video fullscreen so our subtitle overlay stays visible,
  // and keep isFullscreen state in sync.
  useEffect(() => {
    const onFullscreenChange = () => {
      const fsEl = document.fullscreenElement;
      if (videoRef.current && fsEl === videoRef.current) {
        document.exitFullscreen().then(() => {
          videoContainerRef.current?.requestFullscreen().catch(() => {});
        }).catch(() => {});
      }
      setIsFullscreen(!!fsEl);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Recovery prompt: show when a prior generation was interrupted for this video
  useEffect(() => {
    if (!video?.id || isGeneratingSubtitles) return;
    const pending = getGenerationProgress(video.id);
    if (!pending) return;
    // Only surface if partial subtitles already exist
    if (!subtitles || subtitles.segments.length === 0) {
      clearGenerationProgress(video.id);
      return;
    }
    setRecoveryModal({
      open: true,
      completedSegments: pending.completedSegments,
      totalSegments: pending.totalSegments,
      language: pending.language,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id]);

  // 🎯 语言映射函数：将语言代码映射到全称
  const mapLanguageCodeToName = useCallback((langCode: string | null): string => {
    if (!langCode) {
      // 向后兼容：如果没有选择，从UI语言推导
      return language === 'zh' ? 'Chinese' : 'English';
    }
    const languageMap: Record<string, string> = {
      'zh': 'Chinese',
      'en': 'English',
      'ja': 'Japanese',
      'ko': 'Korean',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'ru': 'Russian',
      'auto': 'Auto-detect',
    };
    return languageMap[langCode] || 'Chinese';
  }, [language]);

  // 🎯 视频语言：优先使用用户选择的语言，否则从UI语言推导（向后兼容）
  const sourceLanguage = useMemo(() => {
    return mapLanguageCodeToName(selectedVideoLanguage);
  }, [selectedVideoLanguage, mapLanguageCodeToName]);

  // Generate video hash on mount for caching
  useEffect(() => {
    if (video.sourceType === 'youtube' && video.sourceUrl) {
      setVideoHash(`youtube:${video.id}`);
      isSegmentedProcessingAvailable().then(setSegmentedAvailable).catch(() => setSegmentedAvailable(false));
      return;
    }

    // Generate video hash for caching
    generateVideoHash(video.file).then(hash => {
      setVideoHash(hash);
      console.log('Video hash generated:', hash);
    });
    isSegmentedProcessingAvailable().then(setSegmentedAvailable).catch(() => setSegmentedAvailable(false));
  }, [video]);

  const TABS_MAP: Record<TabType, string> = useMemo(() => ({
    'KeyMoments': t('keyMoments'),
    'Insights': t('insights'),
    'Chat': t('chat'),
    'Notes': t('notes'),
  }), [t]);

  const TABS = useMemo(() => (['KeyMoments', 'Insights', 'Chat', 'Notes'] as TabType[]), []);

  useEffect(() => {
    if (video.sourceType === 'youtube' && video.sourceUrl) {
      setVideoUrl(getYouTubeEmbedUrl(video.sourceUrl));
      setActiveTab('Insights');
      setScreenshotDataUrl(null);
      setIsGeneratingSubtitles(false);
      setIsTranslating(false);
      setGenerationStatus({ active: false, stage: '', progress: 0 });
      setActiveTopic(null);
      setSelectedVideoLanguage(null);
      isInitialMountRef.current = true;
      userClickedRef.current = false;
      setClickedSegmentIndex(null);
      const timer = setTimeout(() => {
        isInitialMountRef.current = false;
      }, 2000);
      return () => clearTimeout(timer);
    }

    const url = URL.createObjectURL(video.file);
    setVideoUrl(url);
    setActiveTab('Insights');
    setScreenshotDataUrl(null);
    setIsGeneratingSubtitles(false);
    setIsTranslating(false);
    setGenerationStatus({ active: false, stage: '', progress: 0 });
    setActiveTopic(null);
    // 🔥 重要：切换视频时重置语言选择，避免用错误的语言识别新视频
    setSelectedVideoLanguage(null);
    // Reset initial mount flag when video changes
    isInitialMountRef.current = true;
    userClickedRef.current = false;
    setClickedSegmentIndex(null); // 重置点击状态
    // Reset after a short delay to allow video to load
    const timer = setTimeout(() => {
      isInitialMountRef.current = false;
    }, 2000);
    return () => {
      URL.revokeObjectURL(url);
      clearTimeout(timer);
    };
  }, [video]);

  // 计算当前激活的字幕索引
  // 如果用户点击了字幕，优先使用点击的索引；否则根据 currentTime 计算
  const computedActiveIndex = subtitles?.segments.findIndex(
    (s) => currentTime >= s.startTime && currentTime <= s.endTime
  ) ?? -1;

  const activeSegmentIndex = clickedSegmentIndex !== null ? clickedSegmentIndex : computedActiveIndex;

  // Sync subtitle text into the Document PiP window
  useEffect(() => {
    const subEl = pipSubtitleRef.current;
    if (!subEl) return;
    if (!showSubtitleOverlay || !subtitles || activeSegmentIndex < 0) { subEl.innerHTML = ''; return; }
    const seg = subtitles.segments[activeSegmentIndex];
    if (!seg) { subEl.innerHTML = ''; return; }
    const showOriginal = displayMode === 'original' || displayMode === 'bilingual';
    const showTranslated = (displayMode === 'translated' || displayMode === 'bilingual') && !!seg.translatedText;
    const fallbackOrig = displayMode === 'translated' && !seg.translatedText;
    const bgRgba = `rgba(0,0,0,${subtitleStyle.bgOpacity / 100})`;
    let html = '';
    if (showOriginal || fallbackOrig) html += `<p style="margin:0;color:${subtitleStyle.textColor}">${seg.text}</p>`;
    if (showTranslated) html += `<p style="margin:2px 0 0;color:${displayMode === 'bilingual' ? '#fde047' : subtitleStyle.textColor}">${seg.translatedText}</p>`;
    subEl.innerHTML = `<div style="display:inline-block;padding:4px 12px;border-radius:4px;background:${bgRgba};font-size:clamp(14px,2.4vw,20px);text-shadow:0 1px 3px rgba(0,0,0,.9);line-height:1.5;">${html}</div>`;
  }, [activeSegmentIndex, isPipOpen, showSubtitleOverlay, subtitles, subtitleStyle, displayMode]);

  // Cancel subtitle generation
  const handleCancelSubtitleGeneration = () => {
    if (abortControllerRef.current) {
      console.log('[VideoDetail] Cancelling subtitle generation...');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGeneratingSubtitles(false);
      setGenerationStatus({ active: false, stage: '', progress: 0 });
      setStreamingSubtitles('');
      toast.info({
        title: language === 'zh' ? '已取消' : 'Cancelled',
        description: language === 'zh' ? '字幕生成已取消' : 'Subtitle generation cancelled',
        duration: 2000
      });
    }
  };

  // 滚动到当前字幕位置的函数
  const scrollToActiveSegment = useCallback(() => {
    if (activeSegmentRef.current && subtitleContainerRef.current && activeSegmentIndex >= 0) {
      const container = subtitleContainerRef.current;
      const element = activeSegmentRef.current;

      // 使用 getBoundingClientRect 检查元素是否在视口内
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      // 检查元素是否完全在容器视口内（留一些边距）
      const margin = 50; // 边距
      const isVisible =
        elementRect.top >= containerRect.top + margin &&
        elementRect.bottom <= containerRect.bottom - margin;

      // 如果不在视口内，滚动到居中位置
      if (!isVisible) {
        // 计算元素相对于容器的位置
        // 使用 scrollTop + getBoundingClientRect 的差值来计算准确的相对位置
        const currentScrollTop = container.scrollTop;
        const elementTopInViewport = elementRect.top;
        const containerTopInViewport = containerRect.top;
        const relativeTop = elementTopInViewport - containerTopInViewport + currentScrollTop;

        const elementHeight = element.offsetHeight;
        const containerHeight = container.clientHeight;

        // 计算目标滚动位置，使元素居中
        const targetScrollTop = relativeTop - (containerHeight / 2) + (elementHeight / 2);

        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth'
        });
      }
    }
  }, [activeSegmentIndex]);

  useEffect(() => {
    // 初始挂载时不滚动
    if (isInitialMountRef.current) {
      return;
    }

    // 如果用户点击了，延迟一下再允许自动滚动
    if (userClickedRef.current) {
      const timer = setTimeout(() => {
        userClickedRef.current = false;
        // 用户点击后，也需要滚动到对应位置
        scrollToActiveSegment();
      }, 200);
      return () => clearTimeout(timer);
    }

    // 视频播放时自动滚动
    if (videoRef.current && !videoRef.current.paused && activeSegmentIndex >= 0) {
      scrollToActiveSegment();
    }
  }, [activeSegmentIndex, scrollToActiveSegment]);

  const handleSeekTo = (time: number, segmentIndex?: number) => {
    if (video.sourceType === 'youtube' && video.sourceUrl) {
      userClickedRef.current = true;
      if (segmentIndex !== undefined) {
        setClickedSegmentIndex(segmentIndex);
        setTimeout(() => {
          setClickedSegmentIndex(null);
        }, 2000);
      }
      setCurrentTime(time);
      setVideoUrl(getYouTubeEmbedUrl(video.sourceUrl, time));
      setTimeout(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            scrollToActiveSegment();
          }, 50);
        });
      }, 50);
      return;
    }

    if (videoRef.current) {
      userClickedRef.current = true; // Mark as user click to prevent auto-scroll

      // 如果提供了 segmentIndex，直接设置选中状态
      if (segmentIndex !== undefined) {
        setClickedSegmentIndex(segmentIndex);
        // 2秒后清除点击状态，恢复自动跟随
        setTimeout(() => {
          setClickedSegmentIndex(null);
        }, 2000);
      } else if (subtitles && subtitles.segments.length > 0) {
        // 如果没有提供 segmentIndex，根据时间计算对应的字幕索引
        const index = subtitles.segments.findIndex(
          (s) => time >= s.startTime && time <= s.endTime
        );
        if (index >= 0) {
          setClickedSegmentIndex(index);
          setTimeout(() => {
            setClickedSegmentIndex(null);
          }, 2000);
        }
      }

      videoRef.current.currentTime = time;
      // 立即更新 currentTime 状态，确保 activeSegmentIndex 正确计算
      setCurrentTime(time);

      // 立即滚动到对应字幕位置（不等待，因为我们已经设置了 clickedSegmentIndex）
      // 使用多重延迟确保 DOM 和 ref 都已更新
      setTimeout(() => {
        requestAnimationFrame(() => {
          // 再次延迟确保 activeSegmentRef 已经更新
          setTimeout(() => {
            scrollToActiveSegment();
          }, 50);
        });
      }, 50);
    }
  };

  const handleScreenshot = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setScreenshotDataUrl(dataUrl);
      setActiveTab('Chat');

      // 复制截图到剪贴板
      try {
        // 将 canvas 转换为 Blob (使用 Promise 包装)
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9);
        });

        if (!blob) {
          throw new Error('Failed to create blob from canvas');
        }

        // 检查是否支持 ClipboardItem API
        if (typeof ClipboardItem === 'undefined') {
          console.warn('ClipboardItem API not supported in this browser');
          toast.info({
            title: t('screenshotSaved'),
            description: t('screenshotAvailableInChat'),
            duration: 2000
          });
          return;
        }

        // 检查剪贴板权限
        if (navigator.clipboard && navigator.permissions) {
          try {
            const permissionStatus = await navigator.permissions.query({ name: 'clipboard-write' as PermissionName });
            if (permissionStatus.state === 'denied') {
              console.warn('Clipboard write permission denied');
              toast.info({
                title: t('screenshotSaved'),
                description: language === 'zh' ? '剪贴板权限被拒绝，截图已保存到聊天面板' : 'Clipboard permission denied, screenshot saved to chat panel',
                duration: 3000
              });
              return;
            }
          } catch (permError) {
            // 某些浏览器可能不支持 permissions.query，继续尝试
            console.log('Could not check clipboard permission:', permError);
          }
        }

        try {
          // 使用 Clipboard API 复制图片
          // ClipboardItem 需要 Promise，所以将 blob 包装成 Promise
          const clipboardItem = new ClipboardItem({
            'image/jpeg': Promise.resolve(blob)
          });

          await navigator.clipboard.write([clipboardItem]);

          // 显示成功提示
          toast.success({
            title: t('screenshotCopied'),
            duration: 2000
          });
        } catch (clipboardError: any) {
          // 如果 Clipboard API 失败（可能因为权限或浏览器不支持）
          console.error('Clipboard API failed:', clipboardError);
          console.error('Error details:', {
            name: clipboardError?.name,
            message: clipboardError?.message,
            stack: clipboardError?.stack
          });

          // 显示错误提示
          const errorMessage = clipboardError?.message || String(clipboardError);
          const isPermissionError = errorMessage.includes('permission') ||
            errorMessage.includes('denied') ||
            clipboardError?.name === 'NotAllowedError';

          toast.info({
            title: t('screenshotSaved'),
            description: isPermissionError
              ? (language === 'zh' ? '需要剪贴板权限，截图已保存到聊天面板' : 'Clipboard permission required, screenshot saved to chat panel')
              : t('screenshotAvailableInChat'),
            duration: 3000
          });
        }
      } catch (error) {
        console.error('Failed to copy screenshot to clipboard:', error);
        // 即使复制失败，截图功能仍然可用
        toast.info({
          title: t('screenshotSaved'),
          description: t('screenshotAvailableInChat'),
          duration: 2000
        });
      }
    }
  };

  // ── Custom video player helpers ─────────────────────────────────────────
  const formatPlayerTime = (s: number) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    videoRef.current.paused
      ? videoRef.current.play().catch(() => {})
      : videoRef.current.pause();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = parseFloat(e.target.value);
  };

  const handleMuteToggle = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
  };

  const handleFullscreenToggle = () => {
    if (!videoContainerRef.current) return;
    if (isFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else {
      videoContainerRef.current.requestFullscreen().catch(() => {});
    }
  };

  const handlePip = async () => {
    if (!videoRef.current) return;

    // Close PiP
    if (isPipOpen) {
      if (pipWindowRef.current) {
        pipWindowRef.current.close();
      } else if (document.pictureInPictureElement) {
        await document.exitPictureInPicture().catch(() => {});
      }
      return;
    }

    // Document PiP (Chrome 116+ — supports custom subtitle overlay)
    if ('documentPictureInPicture' in window) {
      try {
        const pipWin: Window = await (window as any).documentPictureInPicture.requestWindow({ width: 480, height: 270 });
        pipWindowRef.current = pipWin;

        // Copy all stylesheets into the PiP window
        [...document.styleSheets].forEach(sheet => {
          try {
            const cssText = [...sheet.cssRules].map(r => r.cssText).join('');
            const style = pipWin.document.createElement('style');
            style.textContent = cssText;
            pipWin.document.head.appendChild(style);
          } catch { /* cross-origin sheets ignored */ }
        });

        // Setup PiP body
        pipWin.document.body.style.cssText = 'margin:0;padding:0;background:#000;overflow:hidden;width:100vw;height:100vh;';
        const pipContainer = pipWin.document.createElement('div');
        pipContainer.style.cssText = 'position:relative;width:100%;height:100%;background:#000;';
        pipWin.document.body.appendChild(pipContainer);

        // Move <video> into PiP container
        pipContainer.appendChild(videoRef.current);
        (videoRef.current as HTMLVideoElement).style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';

        // Subtitle element in PiP
        const subEl = pipWin.document.createElement('div');
        subEl.style.cssText = 'position:absolute;bottom:16px;left:0;right:0;text-align:center;pointer-events:none;z-index:10;padding:0 12px;';
        pipContainer.appendChild(subEl);
        pipSubtitleRef.current = subEl;

        // Audio-only toggle button
        let audioOnlyMode = false;
        const audioBtn = pipWin.document.createElement('button');
        audioBtn.title = 'Audio only';
        audioBtn.style.cssText = [
          'position:absolute;top:8px;right:8px;z-index:30;',
          'display:flex;align-items:center;gap:4px;',
          'background:rgba(15,23,42,0.65);backdrop-filter:blur(6px);',
          'color:rgba(255,255,255,0.85);border:1px solid rgba(255,255,255,0.15);',
          'border-radius:8px;padding:4px 10px;font-size:11px;font-weight:500;',
          'cursor:pointer;transition:background 0.12s;',
        ].join('');
        audioBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>Audio only`;
        audioBtn.addEventListener('mouseenter', () => { audioBtn.style.background = 'rgba(15,23,42,0.85)'; });
        audioBtn.addEventListener('mouseleave', () => { audioBtn.style.background = 'rgba(15,23,42,0.65)'; });
        audioBtn.addEventListener('click', () => {
          audioOnlyMode = !audioOnlyMode;
          const vid = videoRef.current as HTMLVideoElement | null;
          if (audioOnlyMode) {
            if (vid) vid.style.visibility = 'hidden';
            subEl.style.display = 'none';
            audioBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>Show video`;
            try { pipWin.resizeTo(380, 80); } catch { /* some browsers block this */ }
          } else {
            if (vid) vid.style.visibility = '';
            subEl.style.display = '';
            audioBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>Audio only`;
            try { pipWin.resizeTo(480, 270); } catch { /* ignore */ }
          }
        });
        pipContainer.appendChild(audioBtn);

        pipWin.addEventListener('pagehide', () => {
          // Return <video> to its original container
          if (videoRef.current && videoContainerRef.current && !videoContainerRef.current.contains(videoRef.current)) {
            videoContainerRef.current.insertBefore(videoRef.current, videoContainerRef.current.firstChild);
            (videoRef.current as HTMLVideoElement).style.cssText = '';
          }
          pipSubtitleRef.current = null;
          pipWindowRef.current = null;
          setIsPipOpen(false);
        });

        setIsPipOpen(true);
      } catch (e) {
        console.warn('Document PiP failed, trying native PiP:', e);
        // Fall through to native PiP
        await videoRef.current.requestPictureInPicture().catch(console.error);
        setIsPipOpen(true);
        videoRef.current.addEventListener('leavepictureinpicture', () => setIsPipOpen(false), { once: true });
      }
    } else if ((videoRef.current as any).requestPictureInPicture) {
      // Native PiP fallback (no subtitle overlay)
      await (videoRef.current as any).requestPictureInPicture().catch(console.error);
      setIsPipOpen(true);
      videoRef.current.addEventListener('leavepictureinpicture', () => setIsPipOpen(false), { once: true });
    }
  };
  // ────────────────────────────────────────────────────────────────────────

  const handleImportSubtitlesClick = () => {
    subtitleInputRef.current?.click();
  };

  const handleSubtitleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    const file = event.target.files[0];

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const segments = parseSubtitleFile(file.name, content);

          if (segments.length === 0) {
            throw new Error("The file seems to be empty or in an unsupported format.");
          }

          const newSubtitles: Subtitles = {
            id: video.id,
            videoId: video.id,
            segments,
          };
          await saveSubtitles(video.id, newSubtitles);
          onSubtitlesChange(video.id);
          toast.success({
            title: language === 'zh' ? '字幕导入成功' : 'Subtitles Imported',
            description: language === 'zh' ? '可在右侧见解面板手动生成见解。' : 'You can generate insights from the Insights panel.',
            duration: 4000,
          });
        } catch (err) {
          const c = classifyError(err);
          const d = getErrorDisplay(c, language);
          toast.error({ title: d.title, description: d.description, duration: d.toastDuration });
        }
      };
      reader.onerror = () => {
        toast.error({
          title: language === 'zh' ? '读取字幕文件失败' : 'Failed to Read Subtitle File',
          description: language === 'zh' ? '无法读取所选文件，请重试。' : 'The file could not be read. Please try again.',
        });
      };
      reader.readAsText(file);
    } catch (err) {
      const c = classifyError(err);
      const d = getErrorDisplay(c, language);
      toast.error({ title: d.title, description: d.description, duration: d.toastDuration });
    }
  };

  const handleGenerateSubtitles = async (clearCache: boolean = false, videoLanguage?: string) => {
    // Prevent duplicate calls
    if (isGeneratingSubtitles) {
      console.log('Subtitle generation already in progress, ignoring duplicate call');
      return;
    }

    if (video.sourceType === 'youtube') {
      toast.info({
        title: language === 'zh' ? '无法重新转写' : 'Retranscription Not Supported',
        description: language === 'zh'
          ? 'YouTube 视频优先使用平台字幕，不支持重新转写。请重新导入链接以刷新字幕。'
          : 'YouTube videos use imported platform captions. Re-import the link to refresh captions.',
        duration: 5000,
      });
      return;
    }

    // If no language specified and no previous selection, show language selection modal
    if (!videoLanguage && !selectedVideoLanguage) {
      setShowSubtitleLanguageModal(true);
      return;
    }

    // Use provided language or previously selected language
    const langToUse = videoLanguage || selectedVideoLanguage;
    if (langToUse) {
      setSelectedVideoLanguage(langToUse);
    }
    setShowSubtitleLanguageModal(false);

    // Clear cache if requested (for regeneration)
    if (clearCache && videoHash) {
      try {
        await clearVideoCache(videoHash);
        console.log('[VideoDetail] Cleared video cache for regeneration');
      } catch (err) {
        console.warn('[VideoDetail] Failed to clear cache:', err);
      }
    }

    // Validate file size (max 2GB)
    const fileSizeGB = video.file.size / (1024 * 1024 * 1024);
    const fileSizeMB = video.file.size / (1024 * 1024);

    if (fileSizeGB > 2) {
      toast.error({
        title: language === 'zh' ? '文件过大' : 'File Too Large',
        description: language === 'zh'
          ? `视频文件为 ${fileSizeGB.toFixed(2)}GB，超过 2GB 上限，请使用较小的文件。`
          : `Video is ${fileSizeGB.toFixed(2)}GB, which exceeds the 2GB limit. Please use a smaller file.`,
        duration: 6000,
      });
      return;
    }

    const langDisplay = langToUse === 'zh' ? 'Chinese' : langToUse === 'en' ? 'English' : langToUse === 'auto' ? 'Auto-detect' : langToUse || 'Auto-detect';
    console.log(`Starting subtitle generation for ${fileSizeMB.toFixed(1)}MB video in ${langDisplay}`);

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    // Set initial state early to show UI feedback
    setIsGeneratingSubtitles(true);
    setGenerationStatus({ active: true, stage: 'Preparing...', progress: 0 });

    // Get video duration for better user feedback
    try {
      // Check if we can handle full video (Deepgram or FFmpeg segmentation)
      let canHandleFullVideo = segmentedAvailable;
      try {
        if (!canHandleFullVideo) {
          setGenerationStatus({ active: true, stage: 'Checking video processing capabilities...', progress: 2 });

          // Check Deepgram first (no FFmpeg needed)
          const deepgramReady = await isDeepgramAvailable();
          if (deepgramReady) {
            canHandleFullVideo = true;
            console.log('[VideoDetail] Deepgram is available - can process full video');
          } else {
            // Fall back to FFmpeg segmentation check
            const segAvail = await isSegmentedProcessingAvailable();
            if (segAvail !== segmentedAvailable) setSegmentedAvailable(segAvail);
            canHandleFullVideo = segAvail;
          }
        }
      } catch (err) {
        console.warn('Error checking video processing capabilities:', err);
      }

      const metadata = await new Promise<{ duration: number }>((resolve, reject) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => {
          URL.revokeObjectURL(v.src);
          resolve({ duration: v.duration });
        };
        v.onerror = () => {
          URL.revokeObjectURL(v.src);
          reject(new Error('Failed to load metadata'));
        };
        v.src = URL.createObjectURL(video.file);
      });

      const durationMin = metadata.duration / 60;
      const durationSeconds = metadata.duration;

      // 🎯 检查是否使用 Deepgram，如果是则使用 Deepgram 的估算
      const deepgramReady = await isDeepgramAvailable();
      let estimateText: string;

      if (deepgramReady && canHandleFullVideo) {
        // 使用 Deepgram 估算
        const fileSizeMB = video.file.size / (1024 * 1024);
        const VERCEL_SIZE_LIMIT_MB = 4;
        const needsAudioExtraction = fileSizeMB > VERCEL_SIZE_LIMIT_MB;

        const deepgramEstimate = estimateDeepgramProcessingTime(
          fileSizeMB,
          durationSeconds,
          needsAudioExtraction
        );

        // 转换为分钟格式
        const formatTime = (seconds: number) => {
          if (seconds < 60) {
            return `${seconds}秒`;
          }
          const minutes = seconds / 60;
          if (minutes < 1) {
            return `${Math.round(seconds)}秒`;
          }
          if (minutes < 3) {
            return `${minutes.toFixed(1)}分钟`;
          }
          return `${Math.round(minutes)}分钟`;
        };

        estimateText = `${formatTime(deepgramEstimate.min)}-${formatTime(deepgramEstimate.max)}`;
        console.log(
          `[VideoDetail] 📊 Deepgram estimate: ${estimateText} (file: ${fileSizeMB.toFixed(2)}MB, duration: ${durationMin.toFixed(1)}min)`
        );
      } else {
        // 使用 Gemini 估算（基于完整时长）
        estimateText = formatProcessingEstimate(getProcessingEstimate(durationMin));
      }

      // 仅当没有 Deepgram/FFmpeg 且视频较长时，给出非阻塞的提示（不阻止处理）
      if (!canHandleFullVideo && durationMin > GEMINI_TIMEOUT_HINT_MIN) {
        toast.info({
          title: language === 'zh' ? '长视频提示' : 'Long Video',
          description: language === 'zh'
            ? `视频时长 ${durationMin.toFixed(0)} 分钟，正在尝试完整处理。如遇超时，可在设置中配置 Deepgram 以获得更好的长视频支持。`
            : `Video is ${durationMin.toFixed(0)} min. Attempting full processing. If it times out, configure Deepgram in Settings for better long-video support.`,
          duration: 8000,
        });
      }

      console.log(`Video duration: ${durationMin.toFixed(1)} minutes. Estimated processing time: ${estimateText}.`);
    } catch (err) {
      console.warn('Could not get video duration:', err);
    }

    // Reset log panel for new generation run
    setGenLogs([]);
    addLog(language === 'zh' ? '开始生成字幕...' : 'Starting subtitle generation...', 'info');

    // Update status (initial state already set above)
    setStreamingSubtitles('');
    setSegmentStatus(null);
    setGenerationStatus({ active: true, stage: 'Checking cache...', progress: 5 });

    // Record generation start for recovery detection + benchmark
    recordGenerationStart(video.id, langToUse ?? 'auto');
    benchmarkStartRef.current = { startedAt: Date.now(), peakMemoryMB: readPeakMemoryMB() };

    // 🎯 重要：直接使用当前选择的语言，而不是依赖 sourceLanguage state
    // 因为 setState 是异步的，sourceLanguage 可能还没有更新
    const currentSourceLanguage = mapLanguageCodeToName(langToUse);
    const targetLanguageName = language === 'zh' ? 'Chinese' : 'English';
    const prompt = t('generateSubtitlesPrompt', currentSourceLanguage, targetLanguageName);

    console.log(`[VideoDetail] 🌍 Language selection details:`, {
      userSelectedCode: langToUse,
      mappedToFullName: currentSourceLanguage,
      targetLanguage: targetLanguageName,
      uiLanguage: language
    });

    try {
      const result = await generateResilientSubtitles({
        video,
        videoHash,
        prompt,
        sourceLanguage: currentSourceLanguage,
        abortSignal: abortControllerRef.current?.signal,
        onStatus: ({ stage, progress }) => {
          setGenerationStatus({ active: true, stage, progress });
          addLog(stage, 'info');
        },
        onStreamText: (text) => setStreamingSubtitles(text),
        onSegmentComplete: (completed, total) => {
          setSegmentStatus({ completed, total });
          recordSegmentComplete(video.id, completed, total);
          addLog(`Segment ${completed}/${total} complete`, 'success');
        },
        onPartialSubtitles: async (segments) => {
          const partialSubtitles: Subtitles = {
            id: video.id,
            videoId: video.id,
            segments,
          };
          await saveSubtitles(video.id, partialSubtitles);
        },
      });

      const newSubtitles: Subtitles = {
        id: video.id,
        videoId: video.id,
        segments: result.segments,
      };
      await saveSubtitles(video.id, newSubtitles);
      onSubtitlesChange(video.id);

      setGenerationStatus({ active: true, stage: 'Complete!', progress: 100 });
      clearGenerationProgress(video.id);

      // Save benchmark record
      if (benchmarkStartRef.current) {
        const bm: BenchmarkRecord = {
          videoId: video.id,
          videoName: video.name,
          durationSeconds: video.duration ?? 0,
          fileSizeMB: video.file.size / (1024 * 1024),
          provider: 'auto',
          startedAt: benchmarkStartRef.current.startedAt,
          completedAt: Date.now(),
          success: true,
          segmentCount: result.segments.length,
          coveredSeconds: result.segments.reduce((s, seg) => Math.max(s, seg.endTime), 0),
          peakMemoryMB: readPeakMemoryMB(),
        };
        saveBenchmarkRecord(bm);
        benchmarkStartRef.current = null;
      }

      setTimeout(() => {
        setGenerationStatus({ active: false, stage: '', progress: 0 });
        setSegmentStatus(null);
      }, 1000);

      return; // 提前返回，避免执行下面的 finally
    } catch (err) {
      console.error('Subtitle generation error:', err);
      const classified = classifyError(err);

      // Save failed benchmark record
      if (benchmarkStartRef.current) {
        const bm: BenchmarkRecord = {
          videoId: video.id,
          videoName: video.name,
          durationSeconds: video.duration ?? 0,
          fileSizeMB: video.file.size / (1024 * 1024),
          provider: 'auto',
          startedAt: benchmarkStartRef.current.startedAt,
          completedAt: Date.now(),
          success: false,
          failureCategory: classified.category,
          segmentCount: 0,
          coveredSeconds: 0,
          peakMemoryMB: readPeakMemoryMB(),
        };
        saveBenchmarkRecord(bm);
        benchmarkStartRef.current = null;
      }

      if (classified.category !== 'cancelled') {
        addLog(`Error: ${classified.rawMessage || classified.category}`, 'error');
        const d = getErrorDisplay(classified, language);
        const hint = language === 'zh'
          ? '部分结果可能已保存，可尝试重新生成。'
          : 'Partial results may have been saved. You can try regenerating.';
        const rawDetail = (classified.category === 'unknown' || classified.category === 'server') && classified.rawMessage
          ? `\n\n${classified.rawMessage.substring(0, 400)}`
          : '';
        toast.error({ title: d.title, description: `${d.description}${rawDetail} ${hint}`, duration: Math.max(d.toastDuration, 12000) });
      } else {
        addLog('Generation cancelled', 'warn');
        console.log('[VideoDetail] Subtitle generation was cancelled by user');
      }
    } finally {
      // 只有在错误情况下才执行 finally（成功时已经 return 了）
      abortControllerRef.current = null;
      setIsGeneratingSubtitles(false);
      setStreamingSubtitles('');
      benchmarkStartRef.current = null;
      setTimeout(() => {
        setGenerationStatus({ active: false, stage: '', progress: 0 });
        setSegmentStatus(null);
      }, 1000);
    }
  };

  const handleTranslateSubtitles = async (targetLang?: 'zh-CN' | 'zh-TW' | 'en') => {
    if (!subtitles || !subtitles.segments || subtitles.segments.length === 0) return;

    // Detect translation state to decide whether to show re-translate / resume dialog
    const hasAnyTranslated = subtitles.segments.some(s => s.translatedText?.trim());
    const hasAllTranslated = subtitles.segments.every(s => s.translatedText?.trim());

    if (hasAnyTranslated) {
      // 如果未指定目标语言，先让用户选语言
      if (!targetLang) {
        setShowTranslationLanguageModal(true);
        return;
      }
      // Show the re-translate / resume choice modal
      setRetranslateModal({ open: true, targetLang, hasPartial: !hasAllTranslated });
      return;
    }

    // 如果未指定目标语言，显示选择对话框
    if (!targetLang) {
      setShowTranslationLanguageModal(true);
      return;
    }

    await runTranslation(targetLang, false);
  };

  /**
   * Core translation runner — separated so the re-translate modal can call it directly.
   * @param targetLang  target language
   * @param forceRetranslate  true = clear all existing translatedText and start fresh
   */
  const runTranslation = async (
    targetLang: 'zh-CN' | 'zh-TW' | 'en',
    forceRetranslate: boolean
  ) => {
    if (!subtitles) return;

    setGenLogs([]);
    addLog(language === 'zh'
      ? `开始翻译 → ${targetLang}${forceRetranslate ? '（重新翻译）' : ''}`
      : `Start translation → ${targetLang}${forceRetranslate ? ' (re-translate)' : ''}`, 'info');

    // Clear existing translations if force-retranslating
    let inputSegments = subtitles.segments;
    if (forceRetranslate) {
      inputSegments = subtitles.segments.map(s => ({ ...s, translatedText: undefined }));
    }

    setIsTranslationFromUser(true);
    setIsTranslating(true);
    setShowTranslationLanguageModal(false);
    setRetranslateModal(null);
    setGenerationStatus({ active: true, stage: t('translatingSubtitles') || 'Translating...', progress: 0 });

    try {
      const translationOptions: TranslationOptions = {
        skipAlreadyTranslated: !forceRetranslate,
        onBatchComplete: async (partial, done, total) => {
          addLog(`Batch ${done}/${total} done — ${partial.filter(s => s.translatedText?.trim()).length} segments translated`, 'success');
          // Incremental IDB save so progress is never lost
          const merged: Subtitles = {
            ...subtitles,
            segments: partial,
            translatedLanguage: targetLang,
          };
          try {
            await saveSubtitles(video.id, merged);
          } catch (saveErr) {
            addLog(`Failed to save partial result: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`, 'warn');
          }
        },
      };

      const translatedSegments = await translateSubtitles(
        inputSegments,
        targetLang,
        (progress, stage) => {
          setGenerationStatus({ active: true, stage, progress });
          addLog(stage, 'info');
        },
        translationOptions
      );

      if (translatedSegments.length === 0) {
        throw new Error('Translation returned no results');
      }

      const updatedSubtitles: Subtitles = {
        ...subtitles,
        segments: translatedSegments,
        translatedLanguage: targetLang,
        translatedAt: new Date().toISOString(),
      };

      await saveSubtitles(video.id, updatedSubtitles);
      onSubtitlesChange(video.id);
      addLog(language === 'zh' ? '翻译完成 ✓' : 'Translation complete ✓', 'success');

      setGenerationStatus({ active: true, stage: t('translationComplete') || 'Translation complete!', progress: 100 });
      setTimeout(() => {
        setGenerationStatus({ active: false, stage: '', progress: 0 });
        setDisplayMode('translated');
        setIsTranslationFromUser(false);
      }, 1000);
    } catch (err) {
      console.error('[Translation] Error:', err);
      addLog(`Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
      const c = classifyError(err);
      const d = getErrorDisplay(c, language);
      toast.error({ title: d.title, description: d.description, duration: d.toastDuration });
      setGenerationStatus({ active: false, stage: '', progress: 0 });
      setIsTranslationFromUser(false);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleGenerateInsights = async () => {
    const targetLanguageName = language === 'zh' ? 'Chinese' : 'English';
    const analysisPrompts: Record<Exclude<AnalysisType, 'chat'>, string> = {
      summary: t('analysisSummaryPrompt', targetLanguageName),
      'key-info': t('analysisKeyInfoPrompt', targetLanguageName),
      topics: t('analysisTopicsPrompt', targetLanguageName),
    };

    // 🔍 调试：检查字幕数据
    console.log('[VideoDetail] 📊 Generating insights...', {
      hasSubtitles: !!subtitles,
      subtitleCount: subtitles?.segments.length || 0,
      videoHash: videoHash || 'not generated',
      existingAnalyses: analyses.length,
    });

    setGenLogs([]);
    addLog(language === 'zh' ? '开始生成见解...' : 'Starting insights generation...', 'info');
    if (analyses.length > 0) {
      addLog(language === 'zh'
        ? `检测到 ${analyses.length}/3 项已有分析，将跳过并继续生成剩余部分`
        : `Detected ${analyses.length}/3 existing analyses — resuming`, 'warn');
    }

    setGenerationStatus({
      active: true,
      stage: subtitles && subtitles.segments.length > 0 ? t('insightsAnalyzing') : t('insightsPreparingVideo'),
      progress: 0,
    });

    try {
      const { newAnalyses, usedTranscript } = await generateResilientInsights({
        video,
        videoHash,
        subtitles,
        prompts: analysisPrompts,
        existingAnalyses: analyses,
        onStatus: ({ stage, progress }) => {
          setGenerationStatus({ active: true, stage, progress });
          addLog(stage, 'info');
        },
      });

      console.log('[VideoDetail] ✅ Insights generated:', {
        newAnalysesCount: newAnalyses.length,
        usedTranscript,
        analysisTypes: newAnalyses.map(a => a.type),
      });

      if (newAnalyses.length > 0) {
        onAnalysesChange(video.id);
        onFirstInsightGenerated();

        // 显示成功提示
        toast.success({
          title: language === 'zh' ? '见解生成完成' : 'Insights Generated',
          description: language === 'zh'
            ? `已生成 ${newAnalyses.length} 项分析结果`
            : `Generated ${newAnalyses.length} analysis results`,
          duration: 3000
        });
      } else {
        // 如果没有生成新的分析，可能是已经存在了
        console.log('[VideoDetail] ℹ️ No new analyses generated (may already exist)');
        toast.info({
          title: language === 'zh' ? '提示' : 'Info',
          description: language === 'zh'
            ? '所有见解已存在，无需重新生成'
            : 'All insights already exist',
          duration: 2000
        });
      }
    } catch (err) {
      console.error('[VideoDetail] ❌ Failed to generate insights:', err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during analysis.';
      toast.error({
        title: language === 'zh' ? '生成失败' : 'Generation Failed',
        description: errorMessage,
        duration: 5000
      });
    } finally {
      setGenerationStatus({ active: false, stage: '', progress: 0 });
    }
  };

  const parsedKeyInfo = useMemo(() => {
    if (!keyInfoAnalysis) return [];
    // Regex to find a line starting with an optional list marker, followed by a timestamp, then text.
    const regex = /^\s*(?:-|\*|\d+\.)?\s*\[(.*?)]\s(.*)/gm;
    const matches = [...keyInfoAnalysis.result.matchAll(regex)];
    return matches.map((match, index) => ({
      timestamp: parseTimestampToSeconds(match[1]),
      text: match[2],
      color: HEATMAP_COLORS[index % HEATMAP_COLORS.length],
    }));
  }, [keyInfoAnalysis]);

  const parsedTopics = useMemo(() => {
    if (!topicsAnalysis) return [];
    return topicsAnalysis.result.split('\n')
      .map(line => line.replace(/^- \s*/, '').trim())
      .filter(topic => topic.length > 0);
  }, [topicsAnalysis]);


  return (
    <div className="min-h-screen px-6 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-6xl xl:max-w-7xl mx-auto">
        {/* Left Column */}
        <div className="lg:col-span-7 flex flex-col gap-6 lg:h-[calc(100vh-3rem)]">
          {/* Video Player Card */}
          <div className="bg-white/80 rounded-3xl shadow-sm flex flex-col overflow-hidden flex-shrink-0 lg:sticky lg:top-6">
            <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">
                  Video
                </p>
                <h2
                  className="mt-0.5 text-sm font-semibold text-slate-900 truncate"
                  title={video.name}
                >
                  {video.name}
                </h2>
              </div>
              <button
                onClick={() => onDeleteVideo(video.id)}
                className="inline-flex items-center justify-center rounded-full p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title={t('deleteVideo')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.134-2.033-2.134H8.71c-1.123 0-2.033.954-2.033 2.134v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
            <div ref={videoContainerRef} className="relative group aspect-video bg-black">
              {video.sourceType === 'youtube' ? (
                <iframe
                  src={videoUrl || undefined}
                  title={video.name}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <>
                  {/* Video element — no native controls */}
                  <video
                    ref={videoRef}
                    src={videoUrl || undefined}
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    onVolumeChange={(e) => setIsMuted(e.currentTarget.muted)}
                    onClick={handlePlayPause}
                    className="w-full h-full cursor-pointer"
                  />

                  {/* Subtitle overlay — draggable */}
                  {showSubtitleOverlay && subtitles && activeSegmentIndex >= 0 && (() => {
                    const seg = subtitles.segments[activeSegmentIndex];
                    const showOriginal = displayMode === 'original' || displayMode === 'bilingual';
                    const showTranslated = (displayMode === 'translated' || displayMode === 'bilingual') && !!seg?.translatedText;
                    const fallbackToOriginal = displayMode === 'translated' && !seg?.translatedText;
                    const bgRgba = `rgba(0,0,0,${subtitleStyle.bgOpacity / 100})`;
                    return (
                      <div
                        className="subtitle-overlay absolute z-20"
                        style={{
                          left: `${subtitleStyle.posX}%`,
                          top: `${subtitleStyle.posY}%`,
                          transform: 'translate(-50%, -50%)',
                          maxWidth: '90%',
                          cursor: isDraggingSubtitle.current ? 'grabbing' : 'grab',
                        }}
                        onMouseDown={(e) => { e.preventDefault(); isDraggingSubtitle.current = true; }}
                        onTouchStart={() => { isDraggingSubtitle.current = true; }}
                        title="Drag to reposition"
                      >
                        <div
                          className="text-center px-3 py-1 rounded leading-snug select-none"
                          style={{
                            fontSize: subtitleStyle.fontSize,
                            color: subtitleStyle.textColor,
                            backgroundColor: bgRgba,
                            textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                          }}
                        >
                          {(showOriginal || fallbackToOriginal) && <p>{seg?.text}</p>}
                          {showTranslated && (
                            <p style={{ color: displayMode === 'bilingual' ? '#fde047' : subtitleStyle.textColor, marginTop: displayMode === 'bilingual' ? 2 : 0 }}>
                              {seg?.translatedText}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Custom controls bar ── */}
                  <div
                    className={`absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-150
                      bg-gradient-to-t from-black/80 via-black/30 to-transparent pt-10 px-3 pb-2.5
                      ${isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}
                  >
                    {/* Seek bar — visual track + transparent input overlay */}
                    {(() => {
                      const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
                      return (
                        <div className="relative h-4 flex items-center mb-2 group/seek cursor-pointer">
                          {/* Track */}
                          <div className="absolute inset-x-0 h-[3px] rounded-full bg-white/20 group-hover/seek:h-[5px] transition-all duration-100 overflow-hidden">
                            <div className="h-full rounded-full bg-white/90" style={{ width: `${pct}%` }} />
                          </div>
                          {/* Thumb dot */}
                          <div
                            className="absolute w-3 h-3 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity -translate-x-1/2 pointer-events-none"
                            style={{ left: `${pct}%` }}
                          />
                          {/* Invisible range input for interaction */}
                          <input
                            type="range" min={0} max={duration || 0} step={0.05} value={currentTime}
                            onChange={handleSeek}
                            className="absolute inset-0 w-full opacity-0 cursor-pointer"
                          />
                        </div>
                      );
                    })()}

                    {/* Controls row */}
                    <div className="flex items-center gap-0.5">
                      {/* Play / Pause */}
                      <button onClick={handlePlayPause} className="ctrl-btn" title={isPlaying ? 'Pause' : 'Play'}>
                        {isPlaying ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        )}
                      </button>

                      {/* Time */}
                      <span className="text-white/60 text-[11px] tabular-nums select-none px-1.5 flex-shrink-0 font-medium">
                        {formatPlayerTime(currentTime)} <span className="text-white/30">/</span> {formatPlayerTime(duration)}
                      </span>

                      <div className="flex-1" />

                      {/* Mute toggle */}
                      <button onClick={handleMuteToggle} className="ctrl-btn" title={isMuted ? 'Unmute' : 'Mute'}>
                        {isMuted ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
                        )}
                      </button>

                      {/* Divider */}
                      <div className="w-px h-4 bg-white/10 mx-1 flex-shrink-0" />

                      {/* CC toggle + subtitle settings */}
                      {subtitles && subtitles.segments.length > 0 && (
                        <div ref={subtitleSettingsRef} className="relative flex items-center flex-shrink-0">
                          {/* CC on/off */}
                          <button
                            onClick={() => setShowSubtitleOverlay(v => !v)}
                            className={`h-7 px-2 text-[10px] font-bold rounded-l-md border-y border-l transition-colors
                              ${showSubtitleOverlay
                                ? 'text-white border-white/40 bg-white/10'
                                : 'text-white/35 border-white/15 hover:text-white/60 hover:bg-white/5'}`}
                            title={showSubtitleOverlay ? 'Hide subtitles' : 'Show subtitles'}
                          >CC</button>
                          {/* Settings gear */}
                          <button
                            onClick={() => setShowSubtitleSettings(v => !v)}
                            className={`h-7 w-6 flex items-center justify-center rounded-r-md border-y border-r transition-colors
                              ${showSubtitleSettings
                                ? 'text-white border-white/40 bg-white/10'
                                : 'text-white/35 border-white/15 hover:text-white/60 hover:bg-white/5'}`}
                            title="Subtitle style"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
                            </svg>
                          </button>

                          {/* Settings popover */}
                          {showSubtitleSettings && (
                            <div className="absolute bottom-full right-0 mb-2 w-52 rounded-lg bg-gray-900/95 border border-white/10 shadow-xl p-3 text-xs text-white space-y-3 z-40">
                              {/* Font size */}
                              <div>
                                <p className="text-white/50 mb-1.5 font-medium uppercase tracking-wide" style={{ fontSize: 10 }}>Size</p>
                                <div className="flex gap-1">
                                  {SUBTITLE_FONT_SIZES.map(sz => (
                                    <button
                                      key={sz}
                                      onClick={() => setSubtitleStyle(s => ({ ...s, fontSize: sz }))}
                                      className={`flex-1 py-1 rounded text-center transition font-semibold
                                        ${subtitleStyle.fontSize === sz
                                          ? 'bg-white text-gray-900'
                                          : 'bg-white/10 hover:bg-white/20 text-white'}`}
                                      style={{ fontSize: Math.min(sz, 14) }}
                                    >
                                      {sz === 13 ? 'S' : sz === 16 ? 'M' : sz === 20 ? 'L' : 'XL'}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Text color */}
                              <div>
                                <p className="text-white/50 mb-1.5 font-medium uppercase tracking-wide" style={{ fontSize: 10 }}>Color</p>
                                <div className="flex gap-1.5">
                                  {SUBTITLE_COLORS.map(c => (
                                    <button
                                      key={c.value}
                                      onClick={() => setSubtitleStyle(s => ({ ...s, textColor: c.value }))}
                                      className={`w-7 h-7 rounded-full border-2 transition
                                        ${subtitleStyle.textColor === c.value ? 'border-white scale-110' : 'border-transparent hover:border-white/50'}`}
                                      style={{ backgroundColor: c.value }}
                                      title={c.label}
                                    />
                                  ))}
                                </div>
                              </div>

                              {/* Background opacity */}
                              <div>
                                <p className="text-white/50 mb-1.5 font-medium uppercase tracking-wide" style={{ fontSize: 10 }}>Background</p>
                                <div className="flex gap-1">
                                  {SUBTITLE_BG_OPACITIES.map(o => (
                                    <button
                                      key={o.value}
                                      onClick={() => setSubtitleStyle(s => ({ ...s, bgOpacity: o.value }))}
                                      className={`flex-1 py-1 rounded text-center transition
                                        ${subtitleStyle.bgOpacity === o.value
                                          ? 'bg-white text-gray-900 font-semibold'
                                          : 'bg-white/10 hover:bg-white/20 text-white'}`}
                                    >
                                      {o.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Position reset */}
                              <div className="pt-1 border-t border-white/10">
                                <p className="text-white/50 mb-1.5 font-medium uppercase tracking-wide" style={{ fontSize: 10 }}>Position — drag subtitle to move</p>
                                <button
                                  onClick={() => setSubtitleStyle(s => ({ ...s, posX: DEFAULT_SUBTITLE_STYLE.posX, posY: DEFAULT_SUBTITLE_STYLE.posY }))}
                                  className="w-full py-1 rounded text-center bg-white/10 hover:bg-white/20 text-white transition"
                                >
                                  Reset to default
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Divider */}
                      <div className="w-px h-4 bg-white/10 mx-1 flex-shrink-0" />

                      {/* Screenshot */}
                      <button onClick={handleScreenshot} className="ctrl-btn" title="Screenshot">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"/>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"/>
                        </svg>
                      </button>

                      {/* Picture-in-Picture */}
                      <button
                        onClick={handlePip}
                        className={`ctrl-btn ${isPipOpen ? 'text-white bg-white/15' : ''}`}
                        title={isPipOpen ? 'Exit Picture-in-Picture' : 'Picture-in-Picture (with subtitles)'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <rect x="2" y="4" width="20" height="15" rx="2" strokeLinejoin="round"/>
                          <rect x="12" y="11" width="8" height="5" rx="1" fill="currentColor" stroke="none"/>
                        </svg>
                      </button>

                      {/* Fullscreen */}
                      <button onClick={handleFullscreenToggle} className="ctrl-btn" title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                        {isFullscreen ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"/>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {parsedKeyInfo.length > 0 && (
              <div className="px-4 pb-3 pt-2">
                <div className="relative h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  {parsedKeyInfo.map((info, index) => (
                    <div
                      key={index}
                      className={`absolute top-0 h-full rounded-full ${info.color} transition-all hover:scale-y-[1.5] hover:z-10 hover:shadow-lg cursor-pointer origin-center`}
                      style={{
                        left: `${(info.timestamp / video.duration) * 100}%`,
                        width: '5px',
                        transform: 'translateX(-50%)',
                      }}
                      title={`${formatTimestamp(info.timestamp)}: ${info.text}`}
                      onClick={() => handleSeekTo(info.timestamp)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Transcript Card */}
          <div className="bg-white/80 rounded-3xl shadow-sm flex flex-col flex-1 min-h-0  overflow-hidden">
            <div ref={subtitleContainerRef} className="flex-1 min-h-0 overflow-y-auto relative custom-scrollbar">
              {isGeneratingSubtitles || isTranslating ? (
                <div className="flex flex-col items-center justify-center min-h-full text-center px-6">
                  <p className="mt-4 text-sm text-slate-700">{isTranslating ? t('translatingSubtitles') : generationStatus.stage || t('generatingSubtitles')}</p>
                  {segmentStatus && segmentStatus.total > 1 && (
                    <p className="text-xs text-slate-500 mt-1">
                      {language === 'zh'
                        ? `片段 ${segmentStatus.completed}/${segmentStatus.total}`
                        : `Segment ${segmentStatus.completed}/${segmentStatus.total}`}
                    </p>
                  )}
                  {generationStatus.progress > 0 && (
                    <div className="w-full max-w-xs bg-slate-200 rounded-full mt-3">
                      <div className="bg-slate-500 h-1.5 rounded-full transition-all" style={{ width: `${generationStatus.progress}%` }}></div>
                    </div>
                  )}
                  <p className="text-xs text-slate-500 mt-2">
                    {t('subtitleGenerationWarning')}
                  </p>
                  {isGeneratingSubtitles && (
                    <button
                      onClick={handleCancelSubtitleGeneration}
                      className="mt-4 px-4 py-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-full hover:bg-red-100 transition"
                    >
                      {language === 'zh' ? '取消生成' : 'Cancel'}
                    </button>
                  )}
                  {streamingSubtitles && (
                    <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-left max-w-lg max-h-48 overflow-y-auto text-xs whitespace-pre-wrap">
                      <p className="text-slate-600 font-mono">{streamingSubtitles}</p>
                    </div>
                  )}
                  {/* Live generation log */}
                  <div className="w-full max-w-lg mt-3">
                    <GenerationLogPanel logs={genLogs} onClear={() => setGenLogs([])} />
                  </div>
                </div>
              ) : subtitles && subtitles.segments.length > 0 ? (
                <>
                  {/* 虚拟第一行：sticky 固定在顶部 */}
                  <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm">
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <span className="text-[11px] font-medium text-slate-500">
                        Subtitles
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {subtitles?.segments.length ?? 0} segments
                      </span>
                      <div className="ml-auto flex items-center gap-1.5">
                        {/* 显示模式切换按钮 - 放在最右边 */}
                        {subtitles.segments.some(seg => seg.translatedText) && (
                          <div className="flex items-center gap-1 ml-1">
                            {(['original', 'translated', 'bilingual'] as SubtitleDisplayMode[]).map(mode => (
                              <button
                                key={mode}
                                onClick={() => setDisplayMode(mode)}
                                className={`px-2.5 py-1 rounded-full border text-[10px] transition ${displayMode === mode
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                  }`}
                              >
                                {mode === 'original' ? (language === 'zh' ? '原文' : 'Original') :
                                  mode === 'translated' ? (language === 'zh' ? '译文' : 'Translated') :
                                    (language === 'zh' ? '双语' : 'Bilingual')}
                              </button>
                            ))}
                          </div>
                        )}
                        {/* Translate button — always shown; behaviour adapts based on translation state */}
                        {(
                          <button
                            className="inline-flex items-center justify-center rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
                            onClick={() => handleTranslateSubtitles()}
                            disabled={isTranslating}
                            title={
                              subtitles.segments.some(s => s.translatedText?.trim())
                                ? (language === 'zh' ? '重新翻译 / 继续翻译' : 'Re-translate / Resume')
                                : t('translateSubtitles')
                            }
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                              <path d="m5 8 6 6" />
                              <path d="m4 14 6-6 2-3" />
                              <path d="M2 5h12" />
                              <path d="M7 2h1" />
                              <path d="m22 22-5-10-5 10" />
                              <path d="M14 18h6" />
                            </svg>
                          </button>
                        )}
                        <button
                          className="inline-flex items-center justify-center rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
                          onClick={() => setShowRegenerateConfirmModal(true)}
                          disabled={isGeneratingSubtitles || isTranslating}
                          title={language === 'zh' ? '重新生成字幕' : 'Regenerate Subtitles'}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                            <path d="M21 3v5h-5" />
                            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                            <path d="M3 21v-5h5" />
                          </svg>
                        </button>
                        <button
                          className="inline-flex items-center justify-center rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
                          onClick={() => downloadFile(segmentsToSrt(subtitles.segments), `${video.name}.srt`, 'text/plain')}
                          title={language === 'zh' ? '下载字幕' : 'Download'}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                            <path d="M12 15V3" />
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <path d="m7 10 5 5 5-5" />
                          </svg>
                        </button>

                      </div>
                    </div>
                  </div>

                  {/* 真正的字幕行列表 */}
                  <div className="space-y-1.5 text-sm px-3 pb-4 pt-1">
                    {subtitles.segments.map((segment, index) => {
                      const isActive = index === activeSegmentIndex;
                      return (
                        <button
                          key={index}
                          ref={isActive ? activeSegmentRef : null}
                          onClick={() => handleSeekTo(segment.startTime, index)}
                          className={`w-full flex items-start gap-3 rounded-[20px] px-3 py-2 text-left transition-all ${isActive
                              ? 'bg-slate-900 text-slate-50 shadow-sm'
                              : 'bg-slate-50/80 text-slate-800 hover:bg-slate-100'
                            }`}
                        >
                          <span
                            className={`shrink-0 font-mono text-[11px] leading-6 ${isActive ? 'text-slate-200' : 'text-slate-500'
                              }`}
                          >
                            {formatTimestamp(segment.startTime)}
                          </span>
                          <div className="flex-1">
                            {displayMode === 'original' && (
                              <p className={`text-sm ${isActive ? 'text-slate-50' : 'text-slate-800'}`}>
                                {segment.text}
                              </p>
                            )}
                            {displayMode === 'translated' && segment.translatedText && (
                              <p className={`text-sm ${isActive ? 'text-slate-50' : 'text-slate-800'}`}>
                                {segment.translatedText}
                              </p>
                            )}
                            {displayMode === 'bilingual' && (
                              <>
                                <p className={`text-sm ${isActive ? 'text-slate-50 font-medium' : 'text-slate-800'}`}>
                                  {segment.translatedText || segment.text}
                                </p>
                                {segment.translatedText && (
                                  <p className={`text-xs mt-1 ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                                    {segment.text}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                // No subtitles - 使用 min-h-full 确保与有字幕时的最大高度一致
                <div className="flex flex-col items-center justify-center min-h-full text-center px-8 py-12">
                  <p className="text-sm text-slate-600 mb-6">
                    {t('noSubtitles') || 'No subtitles yet'}
                  </p>
                  <div className="flex flex-wrap gap-3 justify-center text-xs max-w-md">
                    <button
                      onClick={() => subtitleInputRef.current?.click()}
                      className="inline-flex items-center px-4 py-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-full hover:bg-slate-100 transition"
                    >
                      {t('importSubtitles')}
                    </button>
                    <button
                      onClick={() => handleGenerateSubtitles()}
                      disabled={isGeneratingSubtitles}
                      className="inline-flex items-center px-4 py-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-full hover:bg-slate-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('generateWithAI')}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <input type="file" ref={subtitleInputRef} onChange={handleSubtitleFileChange} className="hidden" accept=".srt,.vtt" />
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-5 flex flex-col gap-6 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          <div className="bg-white/80 rounded-3xl shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Tabs */}
            <div className="flex-shrink-0 px-5 py-3.5 border-b border-slate-100">
              <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs" role="tablist">
                {TABS.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    role="tab"
                    aria-selected={activeTab === tab}
                    className={`px-3 py-1.5 rounded-full font-medium transition-all ${activeTab === tab
                        ? 'bg-white shadow-sm text-slate-900'
                        : 'text-slate-500 hover:text-slate-800'
                      }`}
                  >
                    {TABS_MAP[tab]}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'KeyMoments' && (
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6">
                <div className="space-y-2">
                  {parsedKeyInfo.length > 0 ? (
                    parsedKeyInfo.map((info, index) => {
                      const isHighlighted = activeTopic ? info.text.toLowerCase().includes(activeTopic.toLowerCase()) : false;
                      const itemOpacity = activeTopic && !isHighlighted ? 'opacity-40' : 'opacity-100';

                      return (
                        <button
                          key={index}
                          onClick={() => handleSeekTo(info.timestamp)}
                          className={`w-full text-left rounded-xl px-3 py-2.5 transition-all duration-200 ${itemOpacity} ${isHighlighted
                              ? 'bg-amber-50 text-slate-900'
                              : 'hover:bg-slate-50'
                            }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-mono text-xs text-slate-500">{formatTimestamp(info.timestamp)}</span>
                            <span className={`inline-block w-2 h-2 rounded-full ${info.color}`}></span>
                          </div>
                          <p className="mt-1.5 text-sm text-slate-700">{info.text}</p>
                        </button>
                      );
                    })
                  ) : (
                    <p className="text-sm text-slate-500">
                      {keyInfoAnalysis ? t('noKeyMomentsGenerated') : t('keyMomentsTabPlaceholder')}
                    </p>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'Insights' && (
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6">
                {generationStatus.active ? (
                  <div className="flex flex-col items-center justify-center min-h-full text-center">
                    <div className="w-12 h-12 border-[3px] border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
                    <p className="mt-4 text-sm text-slate-700">{generationStatus.stage}</p>
                    {generationStatus.stage === t('insightsPreparingVideo') && (
                      <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                        <div className="bg-slate-500 h-1.5 rounded-full" style={{ width: `${generationStatus.progress}%` }}></div>
                      </div>
                    )}
                    <p className="text-xs text-slate-500 mt-2">{t('generatingInsights')}</p>
                    <div className="w-full max-w-sm mt-3">
                      <GenerationLogPanel logs={genLogs} onClear={() => setGenLogs([])} />
                    </div>
                  </div>
                ) : summaryAnalysis ? (
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-medium text-slate-700">{t('summary')}</h3>
                        <button
                          onClick={handleGenerateInsights}
                          disabled={generationStatus.active}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-full hover:bg-slate-100 hover:text-slate-700 transition disabled:opacity-40"
                          title={language === 'zh' ? '重新生成见解' : 'Regenerate insights'}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          {language === 'zh' ? '重新生成' : 'Regenerate'}
                        </button>
                      </div>
                      <div className="text-sm text-slate-700 leading-relaxed"><MarkdownRenderer content={summaryAnalysis.result} onTimestampClick={handleSeekTo} /></div>
                    </div>
                    {topicsAnalysis && (
                      <div>
                        <h3 className="text-sm font-medium mb-3 text-slate-700">{t('topics')}</h3>
                        {parsedTopics.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {parsedTopics.map((topic, i) => (
                              <button
                                key={i}
                                onClick={() => setActiveTopic(prev => prev === topic ? null : topic)}
                                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${activeTopic === topic ? 'bg-slate-900 text-white' : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}
                              >
                                {topic}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">{t('noTopicsGenerated')}</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 mb-4">
                      <svg className="w-full h-full text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.375 3.375 0 0114 18.442V21.75a1.5 1.5 0 01-3 0v-3.308c0-.944.345-1.846.945-2.55l.547-.547z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-medium text-slate-700 mb-2">{t('unlockInsights')}</h3>
                    <p className="text-xs text-slate-500 mb-6">{t('unlockInsightsDesc')}</p>
                    <button
                      onClick={handleGenerateInsights}
                      className="px-5 py-2 bg-slate-900 text-white rounded-full hover:bg-slate-800 transition text-xs font-medium"
                    >
                      {analyses.length > 0
                        ? (language === 'zh' ? `继续生成见解 (${analyses.length}/3 已完成)` : `Continue Insights (${analyses.length}/3 done)`)
                        : t('generateInsights')}
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* ChatPanel is always mounted to prevent in-flight requests from being aborted on tab switch */}
            <div className={`flex-1 flex flex-col min-h-0 ${activeTab === 'Chat' ? '' : 'hidden'}`}>
              <ChatPanel
                video={video}
                subtitles={subtitles}
                analyses={analyses}
                screenshotDataUrl={screenshotDataUrl}
                onClearScreenshot={() => setScreenshotDataUrl(null)}
                onSeekToTime={handleSeekTo}
              />
            </div>
            {activeTab === 'Notes' && (
              <NotesPanel
                video={video}
                note={note}
                currentTime={currentTime}
                onSeekTo={handleSeekTo}
              />
            )}
          </div>
        </div>
      </div>

      {/* 字幕语言选择模态框 */}
      {showSubtitleLanguageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-[32px] bg-white shadow-[0_18px_80px_rgba(15,23,42,0.32)] text-slate-900">
            <button
              onClick={() => setShowSubtitleLanguageModal(false)}
              className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100/80 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="border-b border-slate-100 px-8 py-6">
              <h2 className="text-lg font-semibold tracking-tight">
                {language === 'zh' ? '选择视频语言' : 'Select Video Language'}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {language === 'zh' ? '选择视频中说话的语言' : 'Choose the language spoken in the video'}
              </p>
            </div>
            <div className="px-8 py-6 space-y-3">
              <button
                onClick={() => handleGenerateSubtitles(false, 'auto')}
                className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition"
              >
                <div className="font-medium text-slate-900">
                  {language === 'zh' ? '自动检测' : 'Auto-detect'}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {language === 'zh' ? '让 AI 自动识别视频语言' : 'Let AI automatically detect the language'}
                </div>
              </button>
              <button
                onClick={() => handleGenerateSubtitles(false, 'en')}
                className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition"
              >
                <div className="font-medium text-slate-900">English</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {language === 'zh' ? '视频是英语的' : 'Video is in English'}
                </div>
              </button>
              <button
                onClick={() => handleGenerateSubtitles(false, 'zh')}
                className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition"
              >
                <div className="font-medium text-slate-900">
                  {language === 'zh' ? '中文' : 'Chinese'}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {language === 'zh' ? '视频是中文的' : 'Video is in Chinese'}
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 翻译语言选择模态框 */}
      {showTranslationLanguageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-[32px] bg-white shadow-[0_18px_80px_rgba(15,23,42,0.32)] text-slate-900">
            <button
              onClick={() => setShowTranslationLanguageModal(false)}
              className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100/80 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="border-b border-slate-100 px-8 py-6">
              <h2 className="text-lg font-semibold tracking-tight">
                {language === 'zh' ? '选择翻译语言' : 'Select Translation Language'}
              </h2>
            </div>
            <div className="px-8 py-6 space-y-3">
              <button
                onClick={() => handleTranslateSubtitles('zh-CN')}
                className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition"
              >
                <div className="font-medium text-slate-900">简体中文</div>
                <div className="text-xs text-slate-500 mt-0.5">Simplified Chinese</div>
              </button>
              <button
                onClick={() => handleTranslateSubtitles('zh-TW')}
                className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition"
              >
                <div className="font-medium text-slate-900">繁體中文</div>
                <div className="text-xs text-slate-500 mt-0.5">Traditional Chinese</div>
              </button>
              <button
                onClick={() => handleTranslateSubtitles('en')}
                className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition"
              >
                <div className="font-medium text-slate-900">English</div>
                <div className="text-xs text-slate-500 mt-0.5">英语</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 视频语言选择模态框 */}
      {showSubtitleLanguageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-[32px] bg-white shadow-[0_18px_80px_rgba(15,23,42,0.32)] text-slate-900">
            <button
              onClick={() => setShowSubtitleLanguageModal(false)}
              className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100/80 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="border-b border-slate-100 px-8 py-6">
              <h2 className="text-lg font-semibold tracking-tight">
                {language === 'zh' ? '选择视频语言' : 'Select Video Language'}
              </h2>
              <p className="text-xs text-slate-500 mt-1.5">
                {language === 'zh'
                  ? '请选择视频中实际使用的语言，这将提高字幕识别的准确性'
                  : 'Please select the actual language used in the video to improve subtitle recognition accuracy'}
              </p>
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1 text-xs text-amber-800">
                    {language === 'zh' ? (
                      <>
                        <strong>重要提示：</strong>选择错误的语言会导致字幕识别完全错误！
                        <br />
                        例如：中文视频选择"英文"会识别出无意义的英文单词。
                      </>
                    ) : (
                      <>
                        <strong>Important:</strong> Selecting wrong language will cause completely incorrect subtitles!
                        <br />
                        Example: Selecting "English" for Chinese video will produce meaningless English words.
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="px-8 py-6 space-y-3 max-h-[60vh] overflow-y-auto">
              <button
                onClick={() => {
                  setShowSubtitleLanguageModal(false);
                  handleGenerateSubtitles(false, 'zh');
                }}
                className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition"
              >
                <div className="font-medium text-slate-900">中文 (Chinese)</div>
                <div className="text-xs text-slate-500 mt-0.5">简体中文 / 繁體中文</div>
              </button>
              <button
                onClick={() => {
                  setShowSubtitleLanguageModal(false);
                  handleGenerateSubtitles(false, 'en');
                }}
                className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition"
              >
                <div className="font-medium text-slate-900">English (英语)</div>
                <div className="text-xs text-slate-500 mt-0.5">English</div>
              </button>
              <button
                onClick={() => {
                  setShowSubtitleLanguageModal(false);
                  handleGenerateSubtitles(false, 'ja');
                }}
                className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition"
              >
                <div className="font-medium text-slate-900">日本語 (Japanese)</div>
                <div className="text-xs text-slate-500 mt-0.5">Japanese</div>
              </button>
              <button
                onClick={() => {
                  setShowSubtitleLanguageModal(false);
                  handleGenerateSubtitles(false, 'ko');
                }}
                className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition"
              >
                <div className="font-medium text-slate-900">한국어 (Korean)</div>
                <div className="text-xs text-slate-500 mt-0.5">Korean</div>
              </button>
              <button
                onClick={() => {
                  setShowSubtitleLanguageModal(false);
                  handleGenerateSubtitles(false, 'es');
                }}
                className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition"
              >
                <div className="font-medium text-slate-900">Español (Spanish)</div>
                <div className="text-xs text-slate-500 mt-0.5">Spanish</div>
              </button>
              <button
                onClick={() => {
                  setShowSubtitleLanguageModal(false);
                  handleGenerateSubtitles(false, 'fr');
                }}
                className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition"
              >
                <div className="font-medium text-slate-900">Français (French)</div>
                <div className="text-xs text-slate-500 mt-0.5">French</div>
              </button>
              <button
                onClick={() => {
                  setShowSubtitleLanguageModal(false);
                  handleGenerateSubtitles(false, 'de');
                }}
                className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition"
              >
                <div className="font-medium text-slate-900">Deutsch (German)</div>
                <div className="text-xs text-slate-500 mt-0.5">German</div>
              </button>
              <button
                onClick={() => {
                  setShowSubtitleLanguageModal(false);
                  handleGenerateSubtitles(false, 'auto');
                }}
                className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm border-2 border-dashed border-amber-300 hover:bg-amber-50 hover:border-amber-400 transition"
              >
                <div className="font-medium text-slate-900 flex items-center gap-2">
                  {language === 'zh' ? '自动检测 (Auto Detect)' : 'Auto Detect (自动检测)'}
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                    {language === 'zh' ? '不推荐' : 'Not Recommended'}
                  </span>
                </div>
                <div className="text-xs text-amber-700 mt-0.5 font-medium">
                  {language === 'zh'
                    ? '⚠️ 可能识别错误导致字幕完全不准确，建议手动选择语言'
                    : '⚠️ May cause completely inaccurate subtitles, manual selection recommended'}
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 重新生成字幕确认对话框 */}
      <BaseModal
        open={showRegenerateConfirmModal}
        onOpenChange={setShowRegenerateConfirmModal}
        size="sm"
      >
        <BaseModal.Header
          title={language === 'zh' ? '重新生成字幕' : 'Regenerate Subtitles'}
          subtitle={
            language === 'zh'
              ? '这将清除当前字幕并重新生成，可能需要一些时间。'
              : 'This will clear the current subtitles and regenerate them, which may take some time.'
          }
        />
        <BaseModal.Footer>
          <button
            onClick={() => setShowRegenerateConfirmModal(false)}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
          >
            {language === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            onClick={async () => {
              setShowRegenerateConfirmModal(false);
              await handleGenerateSubtitles(true, selectedVideoLanguage || undefined);
            }}
            className="px-5 py-2 text-sm font-medium text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition"
          >
            {language === 'zh' ? '确认重新生成' : 'Confirm Regenerate'}
          </button>
        </BaseModal.Footer>
      </BaseModal>

      {/* Generic async confirm dialog */}
      {confirmModal && (
        <BaseModal
          open={true}
          onOpenChange={(open) => { if (!open) { confirmModal.resolve(false); setConfirmModal(null); } }}
          size="sm"
          closeOnOverlayClick={false}
        >
          <BaseModal.Header title={confirmModal.title} />
          <BaseModal.Body>
            <p className="text-sm text-slate-600 whitespace-pre-line">{confirmModal.message}</p>
          </BaseModal.Body>
          <BaseModal.Footer>
            <button
              onClick={() => { confirmModal.resolve(false); setConfirmModal(null); }}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
            >
              {language === 'zh' ? '取消' : 'Cancel'}
            </button>
            <button
              onClick={() => { confirmModal.resolve(true); setConfirmModal(null); }}
              className="px-5 py-2 text-sm font-medium text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition"
            >
              {confirmModal.confirmLabel ?? (language === 'zh' ? '确认' : 'Confirm')}
            </button>
          </BaseModal.Footer>
        </BaseModal>
      )}

      {/* Recovery prompt for interrupted generation */}
      {recoveryModal?.open && (
        <BaseModal
          open={true}
          onOpenChange={() => setRecoveryModal(null)}
          size="sm"
        >
          <BaseModal.Header
            title={language === 'zh' ? '上次生成未完成' : 'Previous Generation Incomplete'}
            subtitle={
              recoveryModal.totalSegments > 1
                ? (language === 'zh'
                  ? `已完成 ${recoveryModal.completedSegments}/${recoveryModal.totalSegments} 片段，部分字幕已保存。`
                  : `Completed ${recoveryModal.completedSegments}/${recoveryModal.totalSegments} segments. Partial subtitles are saved.`)
                : (language === 'zh'
                  ? '字幕生成被中断，部分字幕已保存。'
                  : 'Subtitle generation was interrupted. Partial subtitles are saved.')
            }
          />
          <BaseModal.Footer>
            <button
              onClick={() => setRecoveryModal(null)}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
            >
              {language === 'zh' ? '忽略' : 'Dismiss'}
            </button>
            <button
              onClick={() => {
                setRecoveryModal(null);
                clearGenerationProgress(video.id);
                handleGenerateSubtitles(true, recoveryModal.language || undefined);
              }}
              className="px-5 py-2 text-sm font-medium text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition"
            >
              {language === 'zh' ? '重新生成' : 'Regenerate'}
            </button>
          </BaseModal.Footer>
        </BaseModal>
      )}
      {/* Re-translate / Resume-translate modal */}
      {retranslateModal?.open && (
        <BaseModal
          open
          onOpenChange={(open) => { if (!open) setRetranslateModal(null); }}
        >
          <BaseModal.Header
            title={
              language === 'zh'
                ? (retranslateModal.hasPartial ? '翻译未完成' : '重新翻译')
                : (retranslateModal.hasPartial ? 'Incomplete Translation' : 'Re-translate')
            }
          />
          <BaseModal.Body>
            <p className="text-sm text-slate-600">
              {retranslateModal.hasPartial
                ? (language === 'zh'
                    ? '检测到上次翻译未完成，可以从断点继续翻译，也可以重新翻译全部。'
                    : 'A partial translation was detected. You can resume from where it left off or start over.')
                : (language === 'zh'
                    ? '字幕已经翻译过了，确定要重新翻译吗？这将覆盖现有译文。'
                    : 'Subtitles are already translated. Re-translating will overwrite the existing translation.')}
            </p>
          </BaseModal.Body>
          <BaseModal.Footer>
            <button
              onClick={() => setRetranslateModal(null)}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition"
            >
              {language === 'zh' ? '取消' : 'Cancel'}
            </button>
            {retranslateModal.hasPartial && (
              <button
                onClick={() => runTranslation(retranslateModal.targetLang, false)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition"
              >
                {language === 'zh' ? '从断点继续' : 'Resume'}
              </button>
            )}
            <button
              onClick={() => runTranslation(retranslateModal.targetLang, true)}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition"
            >
              {language === 'zh' ? '重新翻译' : 'Re-translate'}
            </button>
          </BaseModal.Footer>
        </BaseModal>
      )}
    </div>
  );
};

export default VideoDetail;
