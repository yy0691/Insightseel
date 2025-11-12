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

type TabType = 'Insights' | 'Chat' | 'Notes';

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
  
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  const [isGeneratingSubtitles, setIsGeneratingSubtitles] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showGenerateOptions, setShowGenerateOptions] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState('English');
  const [displayMode, setDisplayMode] = useState<SubtitleDisplayMode>('original');
  
  const [generationStatus, setGenerationStatus] = useState({ active: false, stage: '', progress: 0 });
  const [streamingSubtitles, setStreamingSubtitles] = useState(''); // For real-time subtitle display
  const [videoHash, setVideoHash] = useState<string>(''); // Video hash for caching
  const [segmentedAvailable, setSegmentedAvailable] = useState(false);
  const summaryAnalysis = analyses.find(a => a.type === 'summary');
  const topicsAnalysis = analyses.find(a => a.type === 'topics');
  const keyInfoAnalysis = analyses.find(a => a.type === 'key-info');
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  
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
    'Insights': t('insights'),
    'Chat': t('chat'),
    'Notes': t('notes'),
  }), [t]);

  const TABS = useMemo(() => Object.keys(TABS_MAP) as TabType[], [TABS_MAP]);

  useEffect(() => {
    const url = URL.createObjectURL(video.file);
    setVideoUrl(url);
    setActiveTab('Insights');
    setScreenshotDataUrl(null); 
    setShowGenerateOptions(false);
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

  const handleScreenshot = () => {
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
    setShowGenerateOptions(false);
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
    <div className="h-full py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column */}
      <div className="lg:col-span-7 flex flex-col gap-5 lg:max-h-[calc(100vh-3rem)]">
        {/* Video Player Card */}
        <div className="bg-white/50 text-card-foreground flex flex-col rounded-3xl border border-white/30 overflow-hidden shadow-sm flex-shrink-0 lg:sticky lg:top-6">
            <div className="p-4 h-14 border-b border-slate-300/50 flex justify-between items-center">
                <h2 className="font-semibold text-lg truncate" title={video.name}>{video.name}</h2>
                <button
                    onClick={() => onDeleteVideo(video.id)}
                    className="p-2 rounded-md text-slate-500 hover:bg-red-100 hover:text-red-600 transition-colors"
                    title={t('deleteVideo')}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
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
                    className="w-full h-full"
                />
                <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={handleScreenshot} className="px-3 py-1.5 bg-black/50 text-white text-xs font-semibold rounded-lg hover:bg-black/80 backdrop-blur-sm">
                        Screenshot
                    </button>
                </div>
            </div>

            {parsedKeyInfo.length > 0 && (
              <div className="p-4 pt-2">
                <div className="relative h-2 w-full bg-slate-200/80 rounded-full">
                    {parsedKeyInfo.map((info, index) => (
                        <div
                            key={index}
                            className={`absolute top-0 h-full rounded-full ${info.color} transition-all hover:scale-y-[2] hover:z-10 cursor-pointer origin-center`}
                            style={{
                                left: `${(info.timestamp / video.duration) * 100}%`,
                                width: '4px',
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
        <div className="bg-white/50 rounded-3xl border border-white/30 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-4 border-b border-slate-300/50 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">{t('transcript')}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleImportSubtitlesClick}
                className="h-9 px-3 text-xs font-semibold rounded-lg bg-white/80 text-slate-700 hover:bg-white border border-slate-300/80 shadow-sm transition"
                disabled={isGeneratingSubtitles || isTranslating}
              >
                {t('importSubtitles')}
              </button>
              <button
                onClick={() => setShowGenerateOptions(true)}
                className="h-9 px-3 text-xs font-semibold rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 shadow-sm transition disabled:opacity-60"
                disabled={isGeneratingSubtitles}
              >
                {t('generateWithAI')}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
            {isGeneratingSubtitles || isTranslating ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-16 h-16 border-4 border-slate-300 border-t-slate-800 rounded-full animate-spin"></div>
                    <p className="mt-4 font-semibold">{isTranslating ? t('translatingSubtitles') : generationStatus.stage || t('generatingSubtitles')}</p>
                    {generationStatus.progress > 0 && (
                      <div className="w-full max-w-xs bg-slate-200 rounded-full h-2 mt-3">
                        <div className="bg-slate-600 h-2 rounded-full transition-all" style={{width: `${generationStatus.progress}%`}}></div>
                      </div>
                    )}
                    <p className="text-xs text-slate-500 mt-2">
                      {t('subtitleGenerationWarning')}
                    </p>
                    {streamingSubtitles && (
                      <div className="mt-4 p-3 bg-white/50 rounded-lg border border-slate-200 text-left max-w-lg max-h-48 overflow-y-auto text-xs whitespace-pre-wrap">
                        <p className="text-slate-600 font-mono">{streamingSubtitles}</p>
                      </div>
                    )}
                </div>
            ) : subtitles && subtitles.segments.length > 0 ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-1">
                    {subtitles.segments.some(seg => seg.translatedText) && (
                      <>
                        <button
                          onClick={() => setDisplayMode('original')}
                          className={`text-xs px-2.5 py-1 rounded-lg transition ${
                            displayMode === 'original'
                              ? 'bg-slate-800 text-white'
                              : 'bg-white/50 hover:bg-white/80 border border-white/20 text-slate-600'
                          }`}
                        >
                          {language === 'zh' ? '原文' : 'Original'}
                        </button>
                        <button
                          onClick={() => setDisplayMode('translated')}
                          className={`text-xs px-2.5 py-1 rounded-lg transition ${
                            displayMode === 'translated'
                              ? 'bg-slate-800 text-white'
                              : 'bg-white/50 hover:bg-white/80 border border-white/20 text-slate-600'
                          }`}
                        >
                          {language === 'zh' ? '译文' : 'Translated'}
                        </button>
                        <button
                          onClick={() => setDisplayMode('bilingual')}
                          className={`text-xs px-2.5 py-1 rounded-lg transition ${
                            displayMode === 'bilingual'
                              ? 'bg-slate-800 text-white'
                              : 'bg-white/50 hover:bg-white/80 border border-white/20 text-slate-600'
                          }`}
                        >
                          {language === 'zh' ? '双语' : 'Bilingual'}
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!subtitles.segments.some(seg => seg.translatedText) && (
                      <button
                        onClick={handleTranslateSubtitles}
                        disabled={isTranslating}
                        className="text-xs backdrop-blur-sm bg-white/50 hover:bg-white/80 border border-white/20 text-slate-800 font-medium px-2.5 py-1 rounded-xl transition shadow-sm disabled:opacity-50"
                      >
                        {language === 'zh' ? '翻译字幕' : 'Translate'}
                      </button>
                    )}
                    <button
                        onClick={() => downloadFile(segmentsToSrt(subtitles.segments), `${video.name}.srt`, 'text/plain')}
                        className="text-xs backdrop-blur-sm bg-white/50 hover:bg-white/80 border border-white/20 text-slate-800 font-medium p-1.5 rounded-xl transition shadow-sm"
                        title={language === 'zh' ? '下载字幕' : 'Download'}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                    </button>
                  </div>
                </div>
                <div className="space-y-3 text-sm pr-2">
                    {subtitles.segments.map((segment, index) => (
                    <div
                        key={index}
                        ref={index === activeSegmentIndex ? activeSegmentRef : null}
                        onClick={() => handleSeekTo(segment.startTime)}
                        className={`p-2 rounded-xl border border-transparent cursor-pointer transition-all duration-200 ${
                            index === activeSegmentIndex
                            ? 'bg-slate-800/10 border-slate-200 shadow-sm'
                            : 'hover:bg-slate-800/5'
                        }`}
                    >
                        <span
                            className={`font-mono text-xs ${
                                index === activeSegmentIndex
                                ? 'text-slate-800'
                                : 'text-slate-500'
                            }`}
                        >
                            {formatTimestamp(segment.startTime)}
                        </span>
                        {displayMode === 'original' && (
                          <p
                              className={`mt-1 ${
                                  index === activeSegmentIndex
                                  ? 'text-slate-900'
                                  : 'text-slate-700'
                              }`}
                          >
                              {segment.text}
                          </p>
                        )}
                        {displayMode === 'translated' && segment.translatedText && (
                          <p
                              className={`mt-1 ${
                                  index === activeSegmentIndex
                                  ? 'text-slate-900'
                                  : 'text-slate-700'
                              }`}
                          >
                              {segment.translatedText}
                          </p>
                        )}
                        {displayMode === 'bilingual' && (
                          <>
                            <p
                                className={`mt-1 text-sm ${
                                    index === activeSegmentIndex
                                    ? 'text-slate-900 font-medium'
                                    : 'text-slate-700'
                                }`}
                            >
                                {segment.translatedText || segment.text}
                            </p>
                            {segment.translatedText && (
                              <p
                                  className={`mt-1 text-xs ${
                                      index === activeSegmentIndex
                                      ? 'text-slate-600'
                                      : 'text-slate-500'
                                  }`}
                              >
                                  {segment.text}
                              </p>
                            )}
                          </>
                        )}
                    </div>
                    ))}
                </div>
              </>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-16 h-16 mb-4 text-slate-400">
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z" />
                         </svg>
                    </div>
                    <p className="text-sm text-slate-500">{t('noSubtitles')}</p>
                </div>
            )}
          </div>
          {showGenerateOptions && (
            <div className="p-4 border-t border-slate-200 bg-slate-200/40 flex flex-col gap-3 animate-fade-in">
              <div>
                  <label htmlFor="lang-select" className="font-medium text-slate-800 text-xs">{t('spokenLanguage')}:</label>
                   <select
                      id="lang-select"
                      value={sourceLanguage}
                      onChange={e => setSourceLanguage(e.target.value)}
                      className="mt-1 w-full bg-white/80 border-slate-300 border rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                  >
                      <option>English</option>
                      <option>Chinese</option>
                      <option>Spanish</option>
                      <option>French</option>
                      <option>German</option>
                      <option>Japanese</option>
                      <option>Korean</option>
                      <option>Russian</option>
                  </select>
              </div>
              <div className="flex justify-end gap-2">
                   <button onClick={() => setShowGenerateOptions(false)} className="px-3 py-1 text-xs rounded-lg hover:bg-slate-900/10">{t('cancel')}</button>
                   <button onClick={handleGenerateSubtitles} className="px-3 py-1 text-xs rounded-lg bg-slate-900 text-white hover:bg-slate-800">{t('generate')}</button>
              </div>
            </div>
          )}
          <input type="file" ref={subtitleInputRef} onChange={handleSubtitleFileChange} className="hidden" accept=".srt,.vtt" />
        </div>
      </div>

      {/* Right Column */}
      <div className="lg:col-span-5 flex flex-col gap-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
        {keyInfoAnalysis && (
            <div className="bg-white/50 rounded-3xl border border-white/30 shadow-sm flex flex-col flex-shrink-0 overflow-hidden">
                <div className="p-4 border-b border-slate-300/50">
                    <h3 className="font-semibold">{t('keyMoments')}</h3>
                </div>
                <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar max-h-80">
                    {parsedKeyInfo.length > 0 ? (
                      parsedKeyInfo.map((info, index) => {
                        const isHighlighted = activeTopic ? info.text.toLowerCase().includes(activeTopic.toLowerCase()) : false;
                        const itemOpacity = activeTopic && !isHighlighted ? 'opacity-40' : 'opacity-100';

                        return (
                            <button
                                key={index}
                                onClick={() => handleSeekTo(info.timestamp)}
                                className={`w-full text-left rounded-xl border border-transparent px-3 py-2 transition-all duration-200 ${itemOpacity} ${
                                    isHighlighted
                                        ? 'bg-amber-200/80 text-slate-900 shadow-sm'
                                        : 'hover:bg-slate-100/80 hover:border-slate-200'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-mono text-xs text-slate-500">{formatTimestamp(info.timestamp)}</span>
                                  <span className={`text-[10px] uppercase tracking-wider font-semibold ${info.color.replace('bg-', 'text-')}`}>●</span>
                                </div>
                                <p className="mt-1 text-sm text-slate-700">{info.text}</p>
                            </button>
                        );
                      })
                    ) : (
                    <p className="text-sm text-slate-500 italic">{t('noKeyMomentsGenerated')}</p>
                    )}
                </div>
            </div>
        )}

        <div className="bg-white/50 rounded-3xl border border-white/30 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Tabs */}
          <div className="flex-shrink-0 p-2 border-b border-slate-300/50">
            <div className="bg-slate-200/50 p-1 rounded-xl flex items-center" role="tablist">
                {TABS.map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        role="tab"
                        aria-selected={activeTab === tab}
                        className={`flex-1 py-1.5 text-sm font-semibold transition-all duration-200 rounded-lg ${
                            activeTab === tab
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:bg-white/50'
                        }`}
                    >
                        {TABS_MAP[tab]}
                    </button>
                ))}
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'Insights' && (
              <div className="flex-1 overflow-y-auto custom-scrollbar flex">
                  {generationStatus.active ? (
                      <div className="flex flex-col items-center justify-center h-full p-4 text-center m-auto">
                          <div className="w-16 h-16 border-4 border-slate-300 border-t-slate-800 rounded-full animate-spin"></div>
                          <p className="mt-4 font-semibold">{generationStatus.stage}</p>
                          {generationStatus.stage === t('insightsPreparingVideo') && (
                              <div className="w-full bg-slate-200 rounded-full h-2.5 mt-2">
                                  <div className="bg-slate-600 h-2.5 rounded-full" style={{width: `${generationStatus.progress}%`}}></div>
                              </div>
                          )}
                          <p className="text-xs text-slate-500 mt-2">{t('generatingInsights')}</p>
                      </div>
                  ) : summaryAnalysis ? (
                      <div className="p-4 space-y-6">
                          <div>
                              <h3 className="font-semibold mb-2">{t('summary')}</h3>
                              <div className="text-sm text-slate-700 leading-relaxed"><MarkdownRenderer content={summaryAnalysis.result} onTimestampClick={handleSeekTo} /></div>
                          </div>
                          {topicsAnalysis && (
                            <div>
                              <h3 className="font-semibold mb-2">{t('topics')}</h3>
                              {parsedTopics.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                  {parsedTopics.map((topic, i) => (
                                  <button
                                      key={i}
                                      onClick={() => setActiveTopic(prev => prev === topic ? null : topic)}
                                      className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                                          activeTopic === topic ? 'bg-slate-800 text-white' : 'bg-slate-200/80 hover:bg-slate-300/80 text-slate-700'
                                      }`}
                                  >
                                      {topic}
                                  </button>
                                  ))}
                              </div>
                               ) : (
                                  <p className="text-sm text-slate-500 italic">{t('noTopicsGenerated')}</p>
                              )}
                            </div>
                          )}
                      </div>
                  ) : (
                      <div className="flex flex-col items-center p-6 text-center m-auto">
                           <div className="w-20 h-20 mb-4">
                              <svg className="w-full h-full text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.375 3.375 0 0114 18.442V21.75a1.5 1.5 0 01-3 0v-3.308c0-.944.345-1.846.945-2.55l.547-.547z" />
                              </svg>
                           </div>
                          <h3 className="font-semibold text-lg">{t('unlockInsights')}</h3>
                          <p className="text-sm text-slate-500 mb-4">{t('unlockInsightsDesc')}</p>
                          <button
                              onClick={handleGenerateInsights}
                              className="w-full h-10 px-4 py-2 inline-flex items-center justify-center rounded-xl text-sm font-medium transition-colors bg-slate-900 text-slate-50 hover:bg-slate-900/90 shadow-sm"
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
              <NotesPanel video={video} note={note} />
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoDetail;