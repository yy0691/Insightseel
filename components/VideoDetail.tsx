import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Video, Subtitles, Analysis, AnalysisType, Note } from '../types';
import { parseSubtitleFile, formatTimestamp, parseSrt, segmentsToSrt, downloadFile, parseTimestampToSeconds, extractFramesFromVideo } from '../utils/helpers';
import { subtitleDB, analysisDB } from '../services/dbService';
import { generateSubtitles, analyzeVideo, translateSubtitles } from '../services/geminiService';
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

type TabType = 'Insights' | 'Transcript' | 'Chat' | 'Notes';

const INSIGHTS_TO_GENERATE: AnalysisType[] = ['summary', 'key-info', 'topics'];

const HEATMAP_COLORS = [
    'bg-sky-400', 'bg-lime-400', 'bg-amber-400', 'bg-violet-400', 'bg-rose-400', 
    'bg-teal-400', 'bg-orange-400', 'bg-fuchsia-400'
];

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
  
  const [generationStatus, setGenerationStatus] = useState({ active: false, stage: '', progress: 0 });
  const summaryAnalysis = analyses.find(a => a.type === 'summary');
  const topicsAnalysis = analyses.find(a => a.type === 'topics');
  const keyInfoAnalysis = analyses.find(a => a.type === 'key-info');
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  
  const TABS_MAP: Record<TabType, string> = useMemo(() => ({
    'Insights': t('insights'),
    'Transcript': t('transcript'),
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
          await subtitleDB.put(newSubtitles);
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
    if (!video) return;
    setIsGeneratingSubtitles(true);
    setShowGenerateOptions(false);
    try {
        const targetLanguageName = language === 'zh' ? 'Chinese' : 'English';
        const prompt = t('generateSubtitlesPrompt', sourceLanguage, targetLanguageName);
        const srtContent = await generateSubtitles(video.file, prompt);
        const segments = parseSrt(srtContent);
        
        if (segments.length === 0) {
            throw new Error("The model was unable to generate valid subtitles. The video might not contain clear speech, or the language was incorrect.");
        }

        const newSubtitles: Subtitles = {
            id: video.id,
            videoId: video.id,
            segments,
        };
        await subtitleDB.put(newSubtitles);
        onSubtitlesChange(video.id);
    } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to generate subtitles.');
    } finally {
        setIsGeneratingSubtitles(false);
    }
  };

  const handleTranslateSubtitles = async () => {
    if (!subtitles) return;
    setIsTranslating(true);
    try {
        const srtContent = segmentsToSrt(subtitles.segments);
        const targetLanguageName = language === 'zh' ? 'English' : 'Chinese';
        const translatedSrtContent = await translateSubtitles(srtContent, targetLanguageName);

        const segments = parseSrt(translatedSrtContent);
        
        if (segments.length === 0) {
            throw new Error("The model was unable to generate a valid translation. The response might have been empty or in an incorrect format.");
        }

        const newSubtitles: Subtitles = {
            id: video.id,
            videoId: video.id,
            segments,
        };
        await subtitleDB.put(newSubtitles);
        onSubtitlesChange(video.id);
    } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to translate subtitles.');
    } finally {
        setIsTranslating(false);
    }
  };

  const handleGenerateInsights = async () => {
    try {
      const hasSubtitles = subtitles && subtitles.segments.length > 0;
      let analysisPayload: { frames?: string[]; subtitlesText?: string; };

      if (hasSubtitles) {
        setGenerationStatus({ active: true, stage: t('insightsAnalyzing'), progress: 0 });
        const subtitlesText = subtitles.segments.map(s => `[${formatTimestamp(s.startTime)}] ${s.text}`).join('\n');
        analysisPayload = { subtitlesText };
        setTimeout(() => setGenerationStatus(prev => ({...prev, progress: 100})), 100); // Animate progress bar
      } else {
        setGenerationStatus({ active: true, stage: t('insightsPreparingVideo'), progress: 0 });
        const MAX_FRAMES_FOR_ANALYSIS = 60;
        const frames = await extractFramesFromVideo(
          video.file,
          MAX_FRAMES_FOR_ANALYSIS,
          (progress) => {
            setGenerationStatus(prev => ({ ...prev, progress }));
          }
        );
        setGenerationStatus(prev => ({ ...prev, stage: t('insightsAnalyzing') }));
        analysisPayload = { frames };
      }

      const analysesToRun = INSIGHTS_TO_GENERATE.filter(type => !analyses.some(a => a.type === type));
      const targetLanguageName = language === 'zh' ? 'Chinese' : 'English';
      const analysisPrompts: Omit<Record<AnalysisType, string>, 'chat'> = {
        'summary': t('analysisSummaryPrompt', targetLanguageName),
        'key-info': t('analysisKeyInfoPrompt', targetLanguageName),
        'topics': t('analysisTopicsPrompt', targetLanguageName),
      };

      const promises = analysesToRun.map(async (type) => {
        const prompt = analysisPrompts[type as keyof typeof analysisPrompts];
        const result = await analyzeVideo({ ...analysisPayload, prompt });
        const newAnalysis: Analysis = {
            id: `${video.id}-${type}-${new Date().getTime()}`,
            videoId: video.id,
            type,
            prompt,
            result,
            createdAt: new Date().toISOString(),
        };
        await analysisDB.put(newAnalysis);
      });
      
      await Promise.all(promises);
      onAnalysesChange(video.id);
      onFirstInsightGenerated();

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
    <div className="flex-1 p-5 grid grid-cols-1 lg:grid-cols-3 gap-5 lg:h-full lg:overflow-hidden">
      {/* Left Column */}
      <div className="lg:col-span-2 flex flex-col gap-5 lg:h-full lg:overflow-hidden">
        {/* Video Player Card */}
        <div className="bg-white/50 text-card-foreground flex flex-col rounded-3xl border border-white/30 overflow-hidden shadow-sm flex-shrink-0 lg:max-h-[65vh]">
            <div className="p-4 border-b border-slate-300/50 flex justify-between items-center">
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
                    src={videoUrl}
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
         {/* Key Moments Card */}
        {keyInfoAnalysis && (
            <div className="bg-white/50 rounded-3xl border border-white/30 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="p-4 border-b border-slate-300/50 flex-shrink-0">
                    <h3 className="font-semibold">{t('keyMoments')}</h3>
                </div>
                <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
                    {parsedKeyInfo.length > 0 ? (
                    <ul className="space-y-2 text-sm pr-2">
                        {parsedKeyInfo.map((info, index) => {
                            const isHighlighted = activeTopic ? info.text.toLowerCase().includes(activeTopic.toLowerCase()) : false;
                            const itemOpacity = activeTopic && !isHighlighted ? 'opacity-40' : 'opacity-100';

                            return (
                                <li 
                                    key={index}
                                    className={`flex items-start cursor-pointer rounded-lg p-1.5 transition-all duration-300 ${itemOpacity} ${isHighlighted ? 'bg-amber-200/80' : 'hover:bg-slate-100/80'}`}
                                    onClick={() => handleSeekTo(info.timestamp)}
                                >
                                    <span className="font-mono text-xs text-slate-500 mr-2">[{formatTimestamp(info.timestamp)}]</span>
                                    <span className="flex-1">{info.text}</span>
                                </li>
                            );
                        })}
                    </ul>
                    ) : (
                    <p className="text-sm text-slate-500 italic">{t('noKeyMomentsGenerated')}</p>
                    )}
                </div>
            </div>
        )}
      </div>

      {/* Right Column */}
      <div className="lg:col-span-1 flex flex-col bg-white/50 rounded-3xl border border-white/30 overflow-hidden shadow-sm lg:h-full">
        {/* Tabs */}
        <div className="flex border-b border-slate-300/50 flex-shrink-0">
            {TABS.map(tab => (
                <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 p-3 text-sm font-semibold transition-colors ${
                        activeTab === tab
                            ? 'text-slate-900 border-b-2 border-slate-900 bg-slate-200/30'
                            : 'text-slate-500 hover:bg-slate-200/20'
                    }`}
                >
                    {TABS_MAP[tab]}
                </button>
            ))}
        </div>
        
        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
            {activeTab === 'Insights' && (
                <div className="p-4 space-y-4">
                    {summaryAnalysis || topicsAnalysis ? (
                        <>
                            {summaryAnalysis && (
                                <div>
                                    <h3 className="font-semibold mb-2">{t('summary')}</h3>
                                    <div className="p-3 bg-slate-100/70 rounded-xl text-sm max-h-96 overflow-y-auto custom-scrollbar">
                                        <MarkdownRenderer content={summaryAnalysis.result} />
                                    </div>
                                </div>
                            )}
                            {topicsAnalysis && (
                                <div>
                                    <h3 className="font-semibold mb-2">{t('topics')}</h3>
                                    {parsedTopics.length > 0 ? (
                                      <div className="flex flex-wrap gap-2">
                                          {parsedTopics.map(topic => (
                                              <button key={topic} onClick={() => setActiveTopic(activeTopic === topic ? null : topic)}
                                                  className={`px-2 py-1 text-xs rounded-full transition-colors ${activeTopic === topic ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>
                                                  {topic}
                                              </button>
                                          ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-slate-500 italic">{t('noTopicsGenerated')}</p>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center p-8 flex flex-col items-center h-full justify-center">
                            {generationStatus.active ? (
                                <div className="w-full max-w-xs">
                                    <p className="text-sm font-medium mb-2">{generationStatus.stage}</p>
                                    <div className="w-full bg-slate-200 rounded-full h-2.5">
                                        <div className="bg-slate-700 h-2.5 rounded-full transition-all duration-300" style={{ width: `${generationStatus.progress}%` }}></div>
                                    </div>
                                </div>
                             ) : (
                                <>
                                 <h3 className="font-semibold text-lg">{t('unlockInsights')}</h3>
                                 <p className="text-sm text-slate-500 mb-4">{t('unlockInsightsDesc')}</p>
                                 <button onClick={handleGenerateInsights} disabled={generationStatus.active} className="h-10 px-5 text-sm font-medium rounded-xl transition-colors bg-slate-900 text-slate-50 hover:bg-slate-900/90 shadow-sm disabled:opacity-50">
                                    {t('generateInsights')}
                                 </button>
                                </>
                             )}
                        </div>
                    )}
                </div>
            )}
            
            {activeTab === 'Transcript' && (
                <div className="p-2 flex-1 flex flex-col h-full">
                    {subtitles && subtitles.segments.length > 0 ? (
                        <div className="space-y-1 overflow-y-auto flex-1 p-2 custom-scrollbar">
                            <div className="flex justify-end sticky top-0 bg-white/50 backdrop-blur-sm pb-2 z-10 space-x-2">
                                <button
                                    onClick={handleTranslateSubtitles}
                                    disabled={isTranslating}
                                    className="text-xs backdrop-blur-sm bg-white/50 hover:bg-white/80 border border-white/20 text-slate-800 font-medium p-1.5 rounded-xl transition shadow-sm disabled:opacity-50"
                                >
                                    {isTranslating ? t('translatingSubtitles') : t('translateSubtitles')}
                                </button>
                                <button onClick={() => downloadFile(segmentsToSrt(subtitles.segments), `${video.name}.srt`, 'text/srt')}
                                    className="text-xs backdrop-blur-sm bg-white/50 hover:bg-white/80 border border-white/20 text-slate-800 font-medium p-1.5 rounded-xl transition shadow-sm">
                                    Export SRT
                                </button>
                            </div>
                            {subtitles.segments.map((segment, index) => (
                                <div
                                    key={index}
                                    ref={index === activeSegmentIndex ? activeSegmentRef : null}
                                    onClick={() => handleSeekTo(segment.startTime)}
                                    className={`p-2 rounded-xl cursor-pointer transition-colors ${
                                        index === activeSegmentIndex
                                            ? 'bg-blue-200/80'
                                            : 'hover:bg-slate-100/70'
                                    }`}
                                >
                                    <p className="text-xs text-slate-500 font-mono">
                                        {formatTimestamp(segment.startTime)}
                                    </p>
                                    <p className="text-sm">{segment.text}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center p-8 flex flex-col items-center justify-center h-full">
                            <h3 className="font-semibold text-lg">{t('noSubtitles')}</h3>
                            {isGeneratingSubtitles && <p className="text-xs text-slate-500 my-2">{t('subtitleGenerationWarning')}</p>}
                            <div className="mt-2 p-1 inline-flex items-center bg-slate-200/70 rounded-xl border border-slate-300/50 shadow-inner space-x-2">
                                <button onClick={handleImportSubtitlesClick} className="h-10 px-5 text-sm font-medium rounded-lg transition-colors bg-white text-slate-800 hover:bg-slate-50 shadow-sm">
                                    {t('importSubtitles')}
                                </button>
                                <input type="file" ref={subtitleInputRef} onChange={handleSubtitleFileChange} className="hidden" accept=".srt,.vtt" />
                                
                                {showGenerateOptions ? (
                                    <div className="p-4 bg-slate-100/80 rounded-xl text-left w-64 shadow-inner">
                                        <label className="text-sm font-medium block mb-1">{t('spokenLanguage')}</label>
                                        <select value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value)} className="w-full border-slate-300 border rounded-xl px-3 py-2 text-sm mb-3">
                                            <option>English</option>
                                            <option>Chinese</option>
                                            <option>Spanish</option>
                                            <option>French</option>
                                            <option>German</option>
                                            <option>Japanese</option>
                                            <option>Korean</option>
                                        </select>
                                        <div className="flex justify-end space-x-2">
                                            <button onClick={() => setShowGenerateOptions(false)} className="px-3 py-1 text-sm rounded-lg hover:bg-slate-200">{t('cancel')}</button>
                                            <button onClick={handleGenerateSubtitles} disabled={isGeneratingSubtitles} className="px-3 py-1 text-sm rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50">
                                                {isGeneratingSubtitles ? t('generatingSubtitles') : t('generate')}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                     <button onClick={() => setShowGenerateOptions(true)} disabled={isGeneratingSubtitles} className="h-10 px-5 text-sm font-medium rounded-lg transition-colors bg-slate-900 text-slate-50 hover:bg-slate-900/90 shadow-sm disabled:opacity-50">
                                        {isGeneratingSubtitles ? t('generatingSubtitles') : t('generateWithAI')}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'Chat' && (
                <ChatPanel
                    video={video}
                    subtitles={subtitles}
                    screenshotDataUrl={screenshotDataUrl}
                    onClearScreenshot={() => setScreenshotDataUrl(null)}
                />
            )}

            {activeTab === 'Notes' && (
                <NotesPanel
                    video={video}
                    note={note}
                />
            )}
        </div>
      </div>
    </div>
  );
};

export default VideoDetail;