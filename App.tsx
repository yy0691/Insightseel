import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import VideoDetail from './components/VideoDetail';
import WelcomeScreen from './components/WelcomeScreen';
import SettingsModal from './components/SettingsModal';
import FeedbackModal from './components/FeedbackModal';
import { Video, Subtitles, Analysis, Note, APISettings } from './types';
import { videoDB, subtitleDB, analysisDB, noteDB, appDB, settingsDB, getEffectiveSettings } from './services/dbService';
import { getVideoMetadata, parseSubtitleFile } from './utils/helpers';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';

// This new component contains the UI and logic that depends on the language context.
const AppContent: React.FC<{ settings: APISettings, onSettingsChange: (newSettings: APISettings) => void }> = ({ settings, onSettingsChange }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [subtitles, setSubtitles] = useState<Record<string, Subtitles>>({});
  const [analyses, setAnalyses] = useState<Record<string, Analysis[]>>({});
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  
  const { t } = useLanguage();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadData = useCallback(async () => {
    try {
        const loadedVideos = await videoDB.getAll();
        
        loadedVideos.sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());

        setVideos(loadedVideos);
        
        if (loadedVideos.length > 0 && !selectedVideoId) {
            setSelectedVideoId(loadedVideos[0].id);
        } else if (loadedVideos.length === 0) {
            setSelectedVideoId(null);
        }
    } catch(err) {
        handleError(err, "Failed to load initial data.");
    }
  }, [selectedVideoId]);
  
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/ exhaustive-deps
  }, []);
  
  const loadDataForVideo = useCallback(async (videoId: string) => {
    if (!videoId) return;
    try {
        const [videoSubtitles, videoAnalyses, videoNote] = await Promise.all([
            subtitleDB.get(videoId),
            analysisDB.getByVideoId(videoId),
            noteDB.get(videoId)
        ]);

        if (videoSubtitles) {
            setSubtitles(prev => ({...prev, [videoId]: videoSubtitles}));
        } else {
             setSubtitles(prev => {
                const newState = {...prev};
                delete newState[videoId];
                return newState;
            });
        }
        if (videoNote) {
            setNotes(prev => ({...prev, [videoId]: videoNote}));
        }
        setAnalyses(prev => ({...prev, [videoId]: videoAnalyses || []}));
    } catch(err) {
        handleError(err, `Failed to load data for video ${videoId}.`);
    }
  }, []);

  useEffect(() => {
    if (selectedVideoId) {
        loadDataForVideo(selectedVideoId);
    }
  }, [selectedVideoId, loadDataForVideo]);

  const handleError = (err: unknown, defaultMessage: string) => {
    const message = err instanceof Error ? err.message : defaultMessage;
    setError(message);
    setTimeout(() => setError(null), 5000);
  }

  const handleSingleVideoImport = async (file: File, folderPath?: string, subtitleFile?: File) => {
    try {
      const metadata = await getVideoMetadata(file);
      const newVideo: Video = {
        id: `${folderPath ? folderPath + '/' : ''}${file.name}-${file.lastModified}`,
        file,
        name: file.name,
        folderPath,
        ...metadata,
        importedAt: new Date().toISOString(),
      };
      if (videos.some(v => v.id === newVideo.id)) {
        console.warn(`Video "${newVideo.name}" from "${folderPath}" already imported.`);
        setSelectedVideoId(newVideo.id);
        return;
      }

      const dbPromises: Promise<any>[] = [videoDB.put(newVideo)];

      if (subtitleFile) {
        const subtitlePromise = new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
              try {
                const content = e.target?.result as string;
                const segments = parseSubtitleFile(subtitleFile.name, content);
                const newSubtitles: Subtitles = { id: newVideo.id, videoId: newVideo.id, segments };
                await subtitleDB.put(newSubtitles);
                resolve();
              } catch (err) {
                reject(err);
              }
            };
            reader.onerror = () => reject(new Error('Failed to read subtitle file.'));
            reader.readAsText(subtitleFile);
        });
        dbPromises.push(subtitlePromise);
      }

      await Promise.all(dbPromises);

      setVideos(prev => {
          const updated = [newVideo, ...prev];
          updated.sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());
          return updated;
      });
      setSelectedVideoId(newVideo.id);
    } catch (err) {
      handleError(err, `Failed to import video: ${file.name}`);
    }
  };

  const handleFileImports = async (files: FileList) => {
    if (!files || files.length === 0) return;

    try {
      const allFiles = Array.from(files);
      const videoFiles = allFiles.filter(f => f.type.startsWith('video/'));
      const subtitleFiles = allFiles.filter(f => f.name.endsWith('.srt') || f.name.endsWith('.vtt'));

      if (videoFiles.length === 0) {
        handleError(new Error("No video files found in selection."), "No videos found.");
        return;
      }

      const videoSubPairs = videoFiles.map(videoFile => {
        const videoName = videoFile.name.substring(0, videoFile.name.lastIndexOf('.'));
        const matchingSubtitle = subtitleFiles.find(subFile => {
          const subName = subFile.name.substring(0, subFile.name.lastIndexOf('.'));
          return subName === videoName;
        });
        return { video: videoFile, subtitle: matchingSubtitle };
      });

      for (const { video, subtitle } of videoSubPairs) {
        await handleSingleVideoImport(video, undefined, subtitle);
      }
    } catch (err) {
      handleError(err, "An error occurred during file import.");
    }
  };

  const handleImportFolderSelection = async (files: FileList) => {
    if (!files || files.length === 0) {
      return;
    }
  
    try {
        const allFiles = Array.from(files);
        const videoFiles: File[] = [];
        const subtitleFiles: File[] = [];

        for (const file of allFiles) {
            if (file.type.startsWith('video/')) {
            videoFiles.push(file);
            } else if (file.name.endsWith('.srt') || file.name.endsWith('.vtt')) {
            subtitleFiles.push(file);
            }
        }
        
        if (videoFiles.length === 0) {
            handleError(new Error("No video files found in the selected folder."), "No videos found.");
            return;
        }

        const videoSubPairs = videoFiles.map(videoFile => {
            const videoName = videoFile.name.substring(0, videoFile.name.lastIndexOf('.'));
            const matchingSubtitle = subtitleFiles.find(subFile => {
                const subName = subFile.name.substring(0, subFile.name.lastIndexOf('.'));
                const subPath = (subFile as any).webkitRelativePath;
                const videoPath = (videoFile as any).webkitRelativePath;
                const subFolder = subPath.substring(0, subPath.lastIndexOf('/'));
                const videoFolder = videoPath.substring(0, videoPath.lastIndexOf('/'));
                return subName === videoName && subFolder === videoFolder;
            });
            return { video: videoFile, subtitle: matchingSubtitle };
        });

        for (const { video, subtitle } of videoSubPairs) {
            const relativePath = (video as any).webkitRelativePath || video.name;
            const folderPath = relativePath.substring(0, relativePath.lastIndexOf('/'));
            await handleSingleVideoImport(video, folderPath, subtitle);
        }
  
    } catch (err) {
      handleError(err, "An error occurred while importing the folder.");
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    const videoToDelete = videos.find(v => v.id === videoId);
    if (!videoToDelete) return;

    if (window.confirm(t('deleteVideoConfirmation', videoToDelete.name))) {
        try {
            await appDB.deleteVideo(videoId);
            const remainingVideos = videos.filter(v => v.id !== videoId);
            setVideos(remainingVideos);
            if (selectedVideoId === videoId) {
                setSelectedVideoId(remainingVideos.length > 0 ? remainingVideos[0].id : null);
            }
        } catch (err) {
            handleError(err, "Failed to delete video.");
        }
    }
  };
  
  const handleDeleteFolder = async (folderPath: string) => {
    const videosInFolder = videos.filter(v => v.folderPath === folderPath);
    if (videosInFolder.length === 0) return;

    if (window.confirm(t('deleteFolderConfirmation', folderPath, videosInFolder.length))) {
        try {
            await Promise.all(videosInFolder.map(v => appDB.deleteVideo(v.id)));

            const remainingVideos = videos.filter(v => v.folderPath !== folderPath);
            setVideos(remainingVideos);
            
            const isSelectedVideoDeleted = videosInFolder.some(v => v.id === selectedVideoId);
            if (isSelectedVideoDeleted) {
                setSelectedVideoId(remainingVideos.length > 0 ? remainingVideos[0].id : null);
            }
        } catch (err) {
            handleError(err, "Failed to delete folder.");
        }
    }
  };

  const handleSaveSettings = async (newSettings: APISettings) => {
    try {
        await settingsDB.put(newSettings);
        // After saving, we re-fetch the effective settings to update the UI
        const updatedSettings = await getEffectiveSettings();
        onSettingsChange(updatedSettings);
        setIsSettingsModalOpen(false);
    } catch (err) {
        handleError(err, "Failed to save settings.");
    }
  };
  
  const handleFirstTimeInsightSuccess = () => {
    const feedbackShown = localStorage.getItem('insightReelFeedbackShown');
    if (!feedbackShown) {
      setIsFeedbackModalOpen(true);
      localStorage.setItem('insightReelFeedbackShown', 'true');
    }
  };

  const selectedVideo = videos.find(v => v.id === selectedVideoId);

  return (
    <div className="h-screen w-screen flex font-sans relative">
      {error && (
        <div className="absolute top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg z-50" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      {isSettingsModalOpen && settings && (
          <SettingsModal 
            settings={settings}
            onSave={handleSaveSettings}
            onClose={() => setIsSettingsModalOpen(false)}
          />
      )}
      {isFeedbackModalOpen && (
        <FeedbackModal 
          onClose={() => setIsFeedbackModalOpen(false)}
          feedbackUrl="https://n1ddxc0sfaq.feishu.cn/share/base/form/shrcnf7gC1S58t8Av4x4eNxWSlh"
        />
      )}
      {videos.length > 0 && selectedVideo ? (
         <>
            {/* Desktop Sidebar */}
            <div className="hidden lg:block fixed top-0 left-0 h-full z-30">
                 <Sidebar
                    videos={videos}
                    selectedVideoId={selectedVideoId}
                    onSelectVideo={setSelectedVideoId}
                    onImportFiles={handleFileImports}
                    onImportFolderSelection={handleImportFolderSelection}
                    isCollapsed={isSidebarCollapsed}
                    onToggle={() => setIsSidebarCollapsed(prev => !prev)}
                    onOpenSettings={() => setIsSettingsModalOpen(true)}
                    onDeleteFolder={handleDeleteFolder}
                    isMobile={false}
                />
            </div>

            {/* Mobile Sidebar */}
            {isMobile && (
                <>
                    <div 
                        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-300 ${isMobileSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        onClick={() => setIsMobileSidebarOpen(false)}
                    ></div>
                    <div className={`fixed top-0 left-0 h-full z-50 transition-transform duration-300 ease-in-out transform ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                        <Sidebar
                            videos={videos}
                            selectedVideoId={selectedVideoId}
                            onSelectVideo={(id) => {
                                setSelectedVideoId(id);
                                setIsMobileSidebarOpen(false);
                            }}
                            onImportFiles={(files) => {
                                handleFileImports(files);
                                setIsMobileSidebarOpen(false);
                            }}
                            onImportFolderSelection={(files) => {
                                handleImportFolderSelection(files);
                                setIsMobileSidebarOpen(false);
                            }}
                            isCollapsed={false}
                            onToggle={() => setIsMobileSidebarOpen(false)}
                            onOpenSettings={() => {
                                setIsSettingsModalOpen(true);
                                setIsMobileSidebarOpen(false);
                            }}
                            onDeleteFolder={handleDeleteFolder}
                            isMobile={true}
                        />
                    </div>
                </>
            )}

            <main className="flex-1 overflow-y-auto lg:pl-20">
                 {isMobile && (
                     <div className="flex-shrink-0 p-2 h-14 border-b border-slate-300/50 flex items-center bg-white/50 backdrop-blur-sm sticky top-0 z-20">
                        <button onClick={() => setIsMobileSidebarOpen(true)} className="p-2 rounded-full hover:bg-slate-900/10" aria-label="Open menu">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        <h1 className="text-lg font-semibold text-slate-800 ml-2 truncate">{t('appName')}</h1>
                    </div>
                )}
                <VideoDetail 
                    video={selectedVideo} 
                    subtitles={subtitles[selectedVideo.id] || null}
                    analyses={analyses[selectedVideo.id] || []}
                    note={notes[selectedVideo.id] || null}
                    onAnalysesChange={loadDataForVideo}
                    onSubtitlesChange={loadDataForVideo}
                    onDeleteVideo={handleDeleteVideo}
                    onFirstInsightGenerated={handleFirstTimeInsightSuccess}
                />
            </main>
         </>
      ) : (
          <WelcomeScreen onImportFiles={handleFileImports} onImportFolderSelection={handleImportFolderSelection} />
      )}
    </div>
  );
};

// The root App component is now simpler. It manages settings state and provides the language context.
const App: React.FC = () => {
  const [settings, setSettings] = useState<APISettings | null>(null);

  useEffect(() => {
    const loadInitialSettings = async () => {
      try {
        const effectiveSettings = await getEffectiveSettings();
        setSettings(effectiveSettings);
      } catch (err) {
        console.error("Failed to load settings:", err);
        // Fallback to default settings in case of DB error
        setSettings({
            id: 'user-settings',
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            language: 'en',
        });
      }
    };
    loadInitialSettings();
  }, []);

  if (!settings) {
    // Render a loading state or nothing while settings are loading
    return <div className="flex items-center justify-center h-screen w-screen">{/* Optional: Add a loading spinner here */}</div>;
  }

  return (
    <LanguageProvider language={settings.language || 'en'}>
      <AppContent settings={settings} onSettingsChange={setSettings} />
    </LanguageProvider>
  );
};

export default App;