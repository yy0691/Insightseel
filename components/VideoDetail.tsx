import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Video, Subtitles, Analysis, AnalysisType, Note, SubtitleDisplayMode } from '../types';
import { parseSubtitleFile, formatTimestamp, parseSrt, segmentsToSrt, downloadFile, parseTimestampToSeconds } from '../utils/helpers';
import { subtitleDB } from '../services/dbService';
import { saveSubtitles } from '../services/subtitleService';
import { translateSubtitles as translateSubtitlesLegacy } from '../services/geminiService';
import { translateSubtitles, detectSubtitleLanguage, isTraditionalChinese } from '../services/translationService';
import { generateVideoHash } from '../services/cacheService';
import { generateResilientSubtitles, generateResilientInsights } from '../services/videoProcessingService';
import { isSegmentedProcessingAvailable } from '../services/segmentedProcessor';
import { isDeepgramAvailable } from '../services/deepgramService';
import { toast } from '../hooks/useToastStore';

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

const MAX_SUBTITLE_DURATION_MIN = 10;

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

const VideoDetail: React.FC<VideoDetailProps> = ({ video, subtitles, analyses, note, onAnalysesChange, onSubtitlesChange, onDeleteVideo, onFirstInsightGenerated }) => {
  const [videoUrl, setVideoUrl] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('Insights');
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const { t, language } = useLanguage();
  
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
  
  const [generationStatus, setGenerationStatus] = useState({ active: false, stage: '', progress: 0 });
  const [streamingSubtitles, setStreamingSubtitles] = useState(''); // For real-time subtitle display
  const [videoHash, setVideoHash] = useState<string>(''); // Video hash for caching
  const [segmentedAvailable, setSegmentedAvailable] = useState(false);
  const summaryAnalysis = analyses.find(a => a.type === 'summary');
  const topicsAnalysis = analyses.find(a => a.type === 'topics');
  const keyInfoAnalysis = analyses.find(a => a.type === 'key-info');
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const sourceLanguage = useMemo(() => (language === 'zh' ? 'Chinese' : 'English'), [language]);
  
  // Generate video hash on mount for caching
  useEffect(() => {
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
    const url = URL.createObjectURL(video.file);
    setVideoUrl(url);
    setActiveTab('Insights');
    setScreenshotDataUrl(null); 
    setIsGeneratingSubtitles(false);
    setIsTranslating(false);
    setGenerationStatus({ active: false, stage: '', progress: 0 });
    setActiveTopic(null);
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
    if (videoRef.current) {
        userClickedRef.current = true; // Mark as user click to prevent auto-scroll
        
        // 如果提供了 segmentIndex，直接设置选中状态
        if (segmentIndex !== undefined) {
          setClickedSegmentIndex(segmentIndex);
          // 2秒后清除点击状态，恢复自动跟随
          setTimeout(() => {
            setClickedSegmentIndex(null);
          }, 2000);
        }
        
        videoRef.current.currentTime = time;
        // 立即更新 currentTime 状态，确保 activeSegmentIndex 正确计算
        setCurrentTime(time);
        
        // 等待 DOM 更新后滚动到对应字幕位置
        // 使用双重延迟确保 ref 已经更新
        setTimeout(() => {
          requestAnimationFrame(() => {
            scrollToActiveSegment();
          });
        }, 100);
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
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to parse subtitle file.');
        }
      };
      reader.onerror = () => {
          alert('Failed to read the subtitle file.');
      };
      reader.readAsText(file);
    } catch (err) {
       alert(err instanceof Error ? err.message : 'An error occurred during import.');
    }
  };
  
  const handleGenerateSubtitles = async () => {
    // Prevent duplicate calls
    if (isGeneratingSubtitles) {
      console.log('Subtitle generation already in progress, ignoring duplicate call');
      return;
    }

    // Validate file size (max 2GB)
    const fileSizeGB = video.file.size / (1024 * 1024 * 1024);
    const fileSizeMB = video.file.size / (1024 * 1024);

    if (fileSizeGB > 2) {
      alert(`Video file is ${fileSizeGB.toFixed(2)}GB, which exceeds the 2GB limit for subtitle generation. Please use a smaller video file.`);
      return;
    }

    console.log(`Starting subtitle generation for ${fileSizeMB.toFixed(1)}MB video`);

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
      const truncatedDuration = canHandleFullVideo ? durationMin : Math.min(durationMin, MAX_SUBTITLE_DURATION_MIN);
      const estimateText = formatProcessingEstimate(getProcessingEstimate(truncatedDuration));

      if (!canHandleFullVideo && durationMin > MAX_SUBTITLE_DURATION_MIN) {
        const proceed = confirm(
          `This video is ${durationMin.toFixed(1)} minutes long.\n\n` +
          `To avoid proxy timeout, only the first ${MAX_SUBTITLE_DURATION_MIN} minutes will be used for subtitle generation.\n\n` +
          `Estimated processing time: ${estimateText}.\n\n` +
          `Continue?`
        );
        if (!proceed) {
          // User cancelled, reset state
          setIsGeneratingSubtitles(false);
          setGenerationStatus({ active: false, stage: '', progress: 0 });
          return;
        }
      } else {
        console.log(
          `Video duration: ${durationMin.toFixed(1)} minutes. Estimated processing time: ${estimateText}.`
        );
      }
    } catch (err) {
      console.warn('Could not get video duration:', err);
    }

    // Update status (initial state already set above)
    setStreamingSubtitles('');
    setGenerationStatus({ active: true, stage: 'Checking cache...', progress: 5 });

    const targetLanguageName = language === 'zh' ? 'Chinese' : 'English';
    const prompt = t('generateSubtitlesPrompt', sourceLanguage, targetLanguageName);

    try {
      const result = await generateResilientSubtitles({
        video,
        videoHash,
        prompt,
        sourceLanguage,
        onStatus: ({ stage, progress }) => setGenerationStatus({ active: true, stage, progress }),
        onStreamText: (text) => setStreamingSubtitles(text),
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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate subtitles.';
      console.error('Subtitle generation error:', err);

      let userMessage = errorMessage;
      if (errorMessage.includes('unable to generate valid subtitles')) {
        userMessage += '\n\nPossible causes:\n' +
          '1. Video audio quality is too low\n' +
          '2. Selected language does not match video language\n' +
          '3. Video contains mostly music/noise instead of speech\n' +
          '4. API quota exceeded or network issue\n\n' +
          'Check browser console (F12) for detailed logs.';
      }

      alert(`${userMessage}\n\nPartial results may have been saved. Try reloading the page.`);
    } finally {
      setIsGeneratingSubtitles(false);
      setStreamingSubtitles('');
      setTimeout(() => {
        setGenerationStatus({ active: false, stage: '', progress: 0 });
      }, 1000);
    }
  };

  const handleTranslateSubtitles = async (targetLang?: 'zh-CN' | 'zh-TW' | 'en') => {
    if (!subtitles || !subtitles.segments || subtitles.segments.length === 0) return;

    if (subtitles.segments.some(seg => seg.translatedText)) {
      alert(t('subtitlesAlreadyTranslated') || 'Subtitles are already translated!');
      return;
    }

    // 如果未指定目标语言，显示选择对话框
    if (!targetLang) {
      setShowTranslationLanguageModal(true);
      return;
    }

    // 标记这是用户主动触发的翻译，不是自动生成
    setIsTranslationFromUser(true);
    setIsTranslating(true);
    setShowTranslationLanguageModal(false);
    setGenerationStatus({ active: true, stage: t('translatingSubtitles') || 'Translating...', progress: 0 });

    try {
      const translatedSegments = await translateSubtitles(
        subtitles.segments,
        targetLang,
        (progress, stage) => {
          setGenerationStatus({ active: true, stage, progress });
        }
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
      // 传递一个标志，表示这是翻译操作，不应该触发见解生成
      onSubtitlesChange(video.id);

      setGenerationStatus({ active: true, stage: t('translationComplete') || 'Translation complete!', progress: 100 });
      setTimeout(() => {
        setGenerationStatus({ active: false, stage: '', progress: 0 });
        setDisplayMode('translated');
        setIsTranslationFromUser(false);
      }, 1000);
    } catch (err) {
      console.error('[Translation] Error:', err);
      alert(err instanceof Error ? err.message : 'Failed to translate subtitles.');
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

    setGenerationStatus({
      active: true,
      stage: subtitles && subtitles.segments.length > 0 ? t('insightsAnalyzing') : t('insightsPreparingVideo'),
      progress: 0,
    });

    try {
      const { newAnalyses } = await generateResilientInsights({
        video,
        videoHash,
        subtitles,
        prompts: analysisPrompts,
        existingAnalyses: analyses,
        onStatus: ({ stage, progress }) => setGenerationStatus({ active: true, stage, progress }),
      });

      if (newAnalyses.length > 0) {
        onAnalysesChange(video.id);
        onFirstInsightGenerated();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An unknown error occurred during analysis.');
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
    <div className="min-h-screen bg-slate-50 px-6 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-6xl xl:max-w-7xl mx-auto">
        {/* Left Column */}
        <div className="lg:col-span-7 flex flex-col gap-6 lg:max-h-[calc(100vh-3rem)]">
          {/* Video Player Card */}
          <div className="bg-white rounded-3xl shadow-sm flex flex-col overflow-hidden flex-shrink-0 lg:sticky lg:top-6">
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
            <div className="relative group aspect-video bg-black">
                <video
                    ref={videoRef}
                    src={videoUrl || undefined}
                    controls
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    className="w-full h-full rounded-none"
                />
                <div className="absolute bottom-3 right-3 flex gap-2 rounded-full bg-black/40 backdrop-blur-sm px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={handleScreenshot} className="px-2.5 py-0.5 text-[11px] font-medium text-slate-50 rounded-full hover:bg-white/10">
                        Screenshot
                    </button>
                </div>
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
        <div className="bg-white rounded-3xl shadow-sm flex flex-col flex-1 min-h-0  overflow-hidden">
          <div ref={subtitleContainerRef} className="flex-1 min-h-0 overflow-y-auto relative custom-scrollbar">
            {isGeneratingSubtitles || isTranslating ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                    <p className="mt-4 text-sm text-slate-700">{isTranslating ? t('translatingSubtitles') : generationStatus.stage || t('generatingSubtitles')}</p>
                    {generationStatus.progress > 0 && (
                      <div className="w-full max-w-xs bg-slate-200 rounded-full h-1.5 mt-3">
                        <div className="bg-slate-500 h-1.5 rounded-full transition-all" style={{width: `${generationStatus.progress}%`}}></div>
                      </div>
                    )}
                    <p className="text-xs text-slate-500 mt-2">
                      {t('subtitleGenerationWarning')}
                    </p>
                    {streamingSubtitles && (
                      <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-left max-w-lg max-h-48 overflow-y-auto text-xs whitespace-pre-wrap">
                        <p className="text-slate-600 font-mono">{streamingSubtitles}</p>
                      </div>
                    )}
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
                              className={`px-2.5 py-1 rounded-full border text-[10px] transition ${
                                displayMode === mode
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
                      {!subtitles.segments.some(seg => seg.translatedText) && (
                        <button
                          className="inline-flex items-center justify-center rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
                          onClick={() => handleTranslateSubtitles()}
                          disabled={isTranslating}
                          title={t('translateSubtitles')}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                            <path d="m5 8 6 6"/>
                            <path d="m4 14 6-6 2-3"/>
                            <path d="M2 5h12"/>
                            <path d="M7 2h1"/>
                            <path d="m22 22-5-10-5 10"/>
                            <path d="M14 18h6"/>
                          </svg>
                        </button>
                      )}
                      <button
                        className="inline-flex items-center justify-center rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
                        onClick={() => downloadFile(segmentsToSrt(subtitles.segments), `${video.name}.srt`, 'text/plain')}
                        title={language === 'zh' ? '下载字幕' : 'Download'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                          <path d="M12 15V3"/>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <path d="m7 10 5 5 5-5"/>
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
                          className={`w-full flex items-start gap-3 rounded-[20px] px-3 py-2 text-left transition-all ${
                            isActive
                              ? 'bg-slate-900 text-slate-50 shadow-sm'
                              : 'bg-slate-50/80 text-slate-800 hover:bg-slate-100'
                          }`}
                        >
                          <span
                            className={`shrink-0 font-mono text-[11px] leading-6 ${
                              isActive ? 'text-slate-200' : 'text-slate-500'
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
                // No subtitles
                <div className="flex flex-col items-center justify-center h-full text-center px-8 py-12">
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
                      onClick={handleGenerateSubtitles}
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
      <div className="lg:col-span-5 flex flex-col gap-6 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
        <div className="bg-white rounded-3xl shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Tabs */}
          <div className="flex-shrink-0 px-5 py-3.5 border-b border-slate-100">
            <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs" role="tablist">
                {TABS.map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        role="tab"
                        aria-selected={activeTab === tab}
                        className={`px-3 py-1.5 rounded-full font-medium transition-all ${
                            activeTab === tab
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
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <div className="space-y-2">
                  {parsedKeyInfo.length > 0 ? (
                    parsedKeyInfo.map((info, index) => {
                      const isHighlighted = activeTopic ? info.text.toLowerCase().includes(activeTopic.toLowerCase()) : false;
                      const itemOpacity = activeTopic && !isHighlighted ? 'opacity-40' : 'opacity-100';

                      return (
                        <button
                          key={index}
                          onClick={() => handleSeekTo(info.timestamp)}
                          className={`w-full text-left rounded-xl px-3 py-2.5 transition-all duration-200 ${itemOpacity} ${
                            isHighlighted
                              ? 'bg-amber-50 text-slate-900'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-mono text-xs text-slate-500">{formatTimestamp(info.timestamp)}</span>
                            <span className={`text-[10px] uppercase tracking-wider font-medium ${info.color.replace('bg-', 'text-')}`}>●</span>
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
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                  {generationStatus.active ? (
                      <div className="flex flex-col items-center justify-center h-full text-center">
                          <div className="w-12 h-12 border-[3px] border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
                          <p className="mt-4 text-sm text-slate-700">{generationStatus.stage}</p>
                          {generationStatus.stage === t('insightsPreparingVideo') && (
                              <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                                  <div className="bg-slate-500 h-1.5 rounded-full" style={{width: `${generationStatus.progress}%`}}></div>
                              </div>
                          )}
                          <p className="text-xs text-slate-500 mt-2">{t('generatingInsights')}</p>
                      </div>
                  ) : summaryAnalysis ? (
                      <div className="space-y-6">
                          <div>
                              <h3 className="text-sm font-medium mb-3 text-slate-700">{t('summary')}</h3>
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
                                      className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                                          activeTopic === topic ? 'bg-slate-900 text-white' : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
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
                              {t('generateInsights')}
                          </button>
                      </div>
                  )}
              </div>
          )}
          {activeTab === 'Chat' && (
              <div className="flex-1 flex flex-col min-h-0">
                <ChatPanel
                  video={video}
                  subtitles={subtitles}
                  screenshotDataUrl={screenshotDataUrl}
                  onClearScreenshot={() => setScreenshotDataUrl(null)}
                  onSeekToTime={handleSeekTo}
                />
              </div>
          )}
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
    </div>
  );
};

export default VideoDetail;