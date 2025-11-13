import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  const screenshotLabel = language === 'zh' ? '发送到聊天' : 'Send to chat';
  const downloadFrameLabel = language === 'zh' ? '下载截图' : 'Download frame';
  const toolbarButtonClasses =
    'inline-flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-slate-500 transition-all duration-150 hover:border-[#E2E5EB] hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6DAE0] shadow-[0_2px_8px_rgba(15,23,42,0.05)]';
  
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  const [isGeneratingSubtitles, setIsGeneratingSubtitles] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [displayMode, setDisplayMode] = useState<SubtitleDisplayMode>('original');
  
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
    return () => URL.revokeObjectURL(url);
  }, [video]);
  
  const activeSegmentIndex = subtitles?.segments.findIndex(
    (s) => currentTime >= s.startTime && currentTime <= s.endTime
  ) ?? -1;

  useEffect(() => {
    if (activeSegmentRef.current) {
        activeSegmentRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }
  }, [activeSegmentIndex]);

  const handleSeekTo = (time: number) => {
    if (videoRef.current) {
        videoRef.current.currentTime = time;
    }
  };

  const captureCurrentFrame = () => {
    if (!videoRef.current) return null;
    const canvas = document.createElement('canvas');
    const { videoWidth, videoHeight, clientWidth, clientHeight } = videoRef.current;
    canvas.width = videoWidth || clientWidth;
    canvas.height = videoHeight || clientHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.92);
  };

  const handleScreenshot = () => {
    const dataUrl = captureCurrentFrame();
    if (!dataUrl) return;
    setScreenshotDataUrl(dataUrl);
    setActiveTab('Chat');
  };

  const handleDownloadCurrentFrame = () => {
    const dataUrl = captureCurrentFrame();
    if (!dataUrl) return;
    const link = document.createElement('a');
    const baseName = video.name.replace(/\.[^/.]+$/, '');
    link.href = dataUrl;
    link.download = `${baseName || 'frame'}-snapshot.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  const handleTranslateSubtitles = async () => {
    if (!subtitles || !subtitles.segments || subtitles.segments.length === 0) return;

    if (subtitles.segments.some(seg => seg.translatedText)) {
      alert('Subtitles are already translated!');
      return;
    }

    setIsTranslating(true);
    setGenerationStatus({ active: true, stage: 'Detecting language...', progress: 0 });

    try {
      const detectedLang = detectSubtitleLanguage(subtitles.segments);
      console.log('[Translation] Detected language:', detectedLang);

      let targetLang: 'zh-CN' | 'zh-TW' | 'en';

      if (detectedLang === 'zh') {
        const isTraditional = isTraditionalChinese(subtitles.segments);
        targetLang = isTraditional ? 'zh-CN' : 'zh-CN';
        console.log('[Translation] Chinese detected, converting to Simplified');
      } else if (detectedLang === 'en') {
        targetLang = 'zh-CN';
        console.log('[Translation] English detected, translating to Simplified Chinese');
      } else {
        targetLang = 'zh-CN';
        console.log('[Translation] Unknown language, defaulting to Simplified Chinese');
      }

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
      onSubtitlesChange(video.id);

      setGenerationStatus({ active: true, stage: 'Translation complete!', progress: 100 });
      setTimeout(() => {
        setGenerationStatus({ active: false, stage: '', progress: 0 });
        setDisplayMode('translated');
      }, 1000);
    } catch (err) {
      console.error('[Translation] Error:', err);
      alert(err instanceof Error ? err.message : 'Failed to translate subtitles.');
      setGenerationStatus({ active: false, stage: '', progress: 0 });
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
    <div className="grid h-full grid-cols-1 gap-6 py-8 lg:grid-cols-12 xl:gap-8">
      {/* Left Column */}
      <div className="flex flex-col gap-6 lg:col-span-7 lg:max-h-[calc(100vh-3rem)]">
        {/* Video Player Card */}
        <div className="flex flex-col overflow-hidden rounded-[28px] border border-[#E5E7EB] bg-[#FCFCFD] shadow-[0_18px_42px_rgba(15,23,42,0.08)] lg:sticky lg:top-6">
          <div className="flex items-center justify-between border-b border-[#E5E7EB]/70 px-6 py-4">
            <h2 className="min-w-0 truncate text-[17px] font-semibold text-slate-700" title={video.name}>
              {video.name}
            </h2>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleScreenshot}
                className={toolbarButtonClasses}
                title={screenshotLabel}
                aria-label={screenshotLabel}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M2 7a2 2 0 0 1 2-2h3l1.2-1.8A1 1 0 0 1 8.97 3h6.06a1 1 0 0 1 .83.45L17 5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleDownloadCurrentFrame}
                className={toolbarButtonClasses}
                title={downloadFrameLabel}
                aria-label={downloadFrameLabel}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M7 10h3V3h4v7h3l-5 6.5z" />
                  <path d="M5 19h14" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => onDeleteVideo(video.id)}
                className={`${toolbarButtonClasses} hover:text-red-600`}
                title={t('deleteVideo')}
                aria-label={t('deleteVideo')}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M5 7h14" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
                  <path d="M9 7V4h6v3" />
                </svg>
              </button>
            </div>
          </div>
          <div className="relative aspect-video bg-slate-900">
            <video
              ref={videoRef}
              src={videoUrl || undefined}
              controls
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              className="h-full w-full object-contain"
            />
          </div>

          {parsedKeyInfo.length > 0 && video.duration > 0 && (
            <div className="border-t border-[#E5E7EB]/60 px-6 py-4">
              <div className="relative flex h-10 items-center">
                <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 rounded-full bg-slate-200" />
                {parsedKeyInfo.map((info, index) => (
                  <button
                    type="button"
                    key={index}
                    onClick={() => handleSeekTo(info.timestamp)}
                    className="group absolute -translate-x-1/2"
                    style={{
                      left: `${Math.min(100, (info.timestamp / Math.max(video.duration, 0.001)) * 100)}%`,
                    }}
                  >
                    <span className={`block h-1.5 w-1.5 rounded-full ${info.color}`}></span>
                    <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-400/20 opacity-0 transition group-hover:opacity-100"></span>
                    <span className="pointer-events-none absolute bottom-full left-1/2 hidden -translate-x-1/2 rounded-xl border border-[#E5E7EB] bg-white/95 px-3 py-2 text-left text-[12px] leading-relaxed text-slate-600 shadow-[0_16px_36px_rgba(15,23,42,0.15)] group-hover:flex group-hover:w-max group-hover:flex-col">
                      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400">
                        {formatTimestamp(info.timestamp)}
                      </span>
                      <span className="mt-1 text-xs">{info.text}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Transcript Card */}
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-[28px] border border-[#E5E7EB] bg-[#FCFCFD] shadow-[0_18px_42px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between border-b border-[#E5E7EB]/70 px-6 py-3.5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('transcript')}</p>
            <div className="flex items-center gap-2">
              {subtitles && subtitles.segments.length > 0 && !subtitles.segments.some((seg) => seg.translatedText) && (
                <button
                  onClick={handleTranslateSubtitles}
                  disabled={isTranslating}
                  className="inline-flex h-9 items-center rounded-xl border border-[#E5E7EB] bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-[0_2px_6px_rgba(15,23,42,0.05)] transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('translateSubtitles')}
                </button>
              )}
              {subtitles && subtitles.segments.length > 0 && (
                <button
                  onClick={() => downloadFile(segmentsToSrt(subtitles.segments), `${video.name}.srt`, 'text/plain')}
                  className="inline-flex h-9 items-center rounded-xl border border-[#E5E7EB] bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-[0_2px_6px_rgba(15,23,42,0.05)] transition hover:bg-white/85"
                  title={language === 'zh' ? '下载字幕' : 'Download'}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4-4 4m0 0-4-4m4 4V4" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
            {isGeneratingSubtitles || isTranslating ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="h-16 w-16 animate-spin rounded-full border-4 border-slate-300 border-t-slate-800"></div>
                <p className="mt-4 text-sm font-semibold text-slate-700">
                  {isTranslating ? t('translatingSubtitles') : generationStatus.stage || t('generatingSubtitles')}
                </p>
                {generationStatus.progress > 0 && (
                  <div className="mt-3 h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full bg-slate-600 transition-all"
                      style={{ width: `${generationStatus.progress}%` }}
                    ></div>
                  </div>
                )}
                <p className="mt-2 text-xs text-slate-500">{t('subtitleGenerationWarning')}</p>
                {streamingSubtitles && (
                  <div className="mt-4 max-h-48 w-full max-w-lg overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white/80 p-4 text-left text-xs text-slate-600 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
                    <p className="whitespace-pre-wrap font-mono leading-relaxed">{streamingSubtitles}</p>
                  </div>
                )}
              </div>
            ) : subtitles && subtitles.segments.length > 0 ? (
              <>
                {subtitles.segments.some((seg) => seg.translatedText) && (
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setDisplayMode('original')}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        displayMode === 'original'
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-[#E5E7EB] bg-white text-slate-600 hover:bg-white/85'
                      }`}
                    >
                      {language === 'zh' ? '原文' : 'Original'}
                    </button>
                    <button
                      onClick={() => setDisplayMode('translated')}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        displayMode === 'translated'
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-[#E5E7EB] bg-white text-slate-600 hover:bg-white/85'
                      }`}
                    >
                      {language === 'zh' ? '译文' : 'Translated'}
                    </button>
                    <button
                      onClick={() => setDisplayMode('bilingual')}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        displayMode === 'bilingual'
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-[#E5E7EB] bg-white text-slate-600 hover:bg-white/85'
                      }`}
                    >
                      {language === 'zh' ? '双语' : 'Bilingual'}
                    </button>
                  </div>
                )}
                <div className="space-y-2.5 text-sm leading-[1.65]">
                  {subtitles.segments.map((segment, index) => {
                    const isActive = index === activeSegmentIndex;
                    return (
                      <button
                        type="button"
                        key={index}
                        ref={isActive ? activeSegmentRef : null}
                        onClick={() => handleSeekTo(segment.startTime)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                          isActive
                            ? 'border-[#E5E7EB] bg-slate-900/5 shadow-[0_12px_28px_rgba(15,23,42,0.08)]'
                            : 'border-transparent hover:border-[#E5E7EB]/80 hover:bg-white'
                        }`}
                      >
                        <span
                          className={`font-mono text-[11px] uppercase tracking-[0.18em] ${
                            isActive ? 'text-slate-800' : 'text-slate-400'
                          }`}
                        >
                          {formatTimestamp(segment.startTime)}
                        </span>
                        {displayMode !== 'translated' && (
                          <p className={`mt-2 text-[13px] ${isActive ? 'text-slate-800' : 'text-slate-600'}`}>
                            {segment.text}
                          </p>
                        )}
                        {displayMode !== 'original' && segment.translatedText && (
                          <p
                            className={`mt-2 text-[13px] ${
                              isActive && displayMode !== 'original' ? 'text-slate-800 font-medium' : 'text-slate-600'
                            }`}
                          >
                            {segment.translatedText}
                          </p>
                        )}
                        {displayMode === 'bilingual' && segment.translatedText && (
                          <p className={`mt-1 text-[12px] ${isActive ? 'text-slate-500' : 'text-slate-400'}`}>
                            {segment.text}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <div className="text-slate-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.2}
                    stroke="currentColor"
                    className="h-10 w-10"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-slate-500">{t('noSubtitles')}</p>
                <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => subtitleInputRef.current?.click()}
                    className="flex-1 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-[0_2px_6px_rgba(15,23,42,0.05)] transition hover:bg-white/85"
                  >
                    {t('importSubtitles')}
                  </button>
                  <button
                    onClick={handleGenerateSubtitles}
                    disabled={isGeneratingSubtitles}
                    className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
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
      <div className="flex flex-col gap-6 lg:col-span-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-[#E5E7EB] bg-[#FCFCFD] shadow-[0_18px_42px_rgba(15,23,42,0.06)]">
          {/* Tabs */}
          <div className="flex-shrink-0 border-b border-[#E5E7EB]/70 px-4 py-4">
            <div className="flex items-center gap-1 rounded-2xl bg-[#F2F4F7] p-1" role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  role="tab"
                  aria-selected={activeTab === tab}
                  className={`flex-1 rounded-[16px] px-3 py-2 text-sm font-semibold transition ${
                    activeTab === tab
                      ? 'bg-white text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.12)]'
                      : 'text-slate-500 hover:bg-white/70'
                  }`}
                >
                  {TABS_MAP[tab]}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'KeyMoments' && (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="space-y-3 px-6 py-5">
                {parsedKeyInfo.length > 0 ? (
                  parsedKeyInfo.map((info, index) => {
                    const isHighlighted = activeTopic
                      ? info.text.toLowerCase().includes(activeTopic.toLowerCase())
                      : false;
                    const itemOpacity = activeTopic && !isHighlighted ? 'opacity-50' : 'opacity-100';

                    return (
                      <button
                        type="button"
                        key={index}
                        onClick={() => handleSeekTo(info.timestamp)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${itemOpacity} ${
                          isHighlighted
                            ? 'border-amber-300 bg-amber-50 shadow-[0_14px_32px_rgba(251,191,36,0.28)]'
                            : 'border-transparent hover:border-[#E5E7EB]/80 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
                            {formatTimestamp(info.timestamp)}
                          </span>
                          <span className={`text-[10px] font-semibold uppercase tracking-[0.24em] ${info.color.replace('bg-', 'text-')}`}>
                            ●
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">{info.text}</p>
                      </button>
                    );
                  })
                ) : (
                  <p className="text-sm italic text-slate-500">
                    {keyInfoAnalysis ? t('noKeyMomentsGenerated') : t('keyMomentsTabPlaceholder')}
                  </p>
                )}
              </div>
            </div>
          )}
          {activeTab === 'Insights' && (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {generationStatus.active ? (
                <div className="m-auto flex h-full flex-col items-center justify-center p-6 text-center">
                  <div className="h-16 w-16 animate-spin rounded-full border-4 border-slate-300 border-t-slate-800"></div>
                  <p className="mt-4 text-sm font-semibold text-slate-700">{generationStatus.stage}</p>
                  {generationStatus.stage === t('insightsPreparingVideo') && (
                    <div className="mt-3 h-2.5 w-full max-w-sm overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-2.5 rounded-full bg-slate-600 transition-all"
                        style={{ width: `${generationStatus.progress}%` }}
                      ></div>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-500">{t('generatingInsights')}</p>
                </div>
              ) : summaryAnalysis ? (
                <div className="space-y-6 px-6 py-5">
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {t('summary')}
                    </h3>
                    <div className="text-[15px] leading-[1.7] text-slate-600">
                      <MarkdownRenderer content={summaryAnalysis.result} onTimestampClick={handleSeekTo} />
                    </div>
                  </div>
                  {topicsAnalysis && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {t('topics')}
                      </h3>
                      {parsedTopics.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {parsedTopics.map((topic, i) => (
                            <button
                              type="button"
                              key={i}
                              onClick={() => setActiveTopic((prev) => (prev === topic ? null : topic))}
                              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                activeTopic === topic
                                  ? 'border-slate-900 bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)]'
                                  : 'border-[#E5E7EB] bg-white text-slate-600 hover:bg-white/85'
                              }`}
                            >
                              {topic}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm italic text-slate-500">{t('noTopicsGenerated')}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="m-auto flex flex-col items-center gap-4 p-6 text-center">
                  <div className="h-16 w-16 rounded-full bg-[#F2F4F7] text-slate-400">
                    <svg
                      className="h-full w-full p-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.375 3.375 0 0 1 14 18.442V21.75a1.5 1.5 0 0 1-3 0v-3.308c0-.944.345-1.846.945-2.55l.547-.547z"
                      />
                    </svg>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-slate-800">{t('unlockInsights')}</h3>
                    <p className="text-sm text-slate-500">{t('unlockInsightsDesc')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateInsights}
                    className="inline-flex h-11 w-full max-w-xs items-center justify-center rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white shadow-[0_18px_32px_rgba(15,23,42,0.2)] transition hover:bg-slate-800"
                  >
                    {t('generateInsights')}
                  </button>
                </div>
              )}
            </div>
          )}
          {activeTab === 'Chat' && (
              <div className="flex-1 min-h-0">
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
              <NotesPanel video={video} note={note} />
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoDetail;