import React, { useState, useEffect, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import VideoDetail from "./components/VideoDetail";
import WelcomeScreen from "./components/WelcomeScreen";
import SettingsModal from "./components/SettingsModal";
import FeedbackModal from "./components/FeedbackModal";
import AuthModal from "./components/AuthModal";
import AccountPanel from "./components/AccountPanel";
import Footer from "./components/Footer";
import TaskQueuePanel from "./components/TaskQueuePanel";
import { Video, Subtitles, Analysis, Note, APISettings } from "./types";
import {
  videoDB,
  subtitleDB,
  analysisDB,
  noteDB,
  appDB,
  settingsDB,
  getEffectiveSettings,
} from "./services/dbService";
import {
  getVideoMetadata,
  parseSubtitleFile,
  generateDeterministicUUID,
} from "./utils/helpers";
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { clearOldCache } from "./services/cacheService";
import { User } from "@supabase/supabase-js";
import { authService } from "./services/authService";
import autoSyncService, { getSyncStatus } from "./services/autoSyncService";
import { saveSubtitles } from "./services/subtitleService";

const AppContent: React.FC<{
  settings: APISettings;
  onSettingsChange: (newSettings: APISettings) => void;
}> = ({ settings, onSettingsChange }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [subtitles, setSubtitles] = useState<Record<string, Subtitles>>({});
  const [analyses, setAnalyses] = useState<Record<string, Analysis[]>>({});
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [syncStatusSnapshot, setSyncStatusSnapshot] = useState(() =>
    getSyncStatus(),
  );

  const { t } = useLanguage();

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      if (!authService.isAvailable()) return;
      const user = await authService.getCurrentUser();
      if (mounted) setCurrentUser(user);
    };

    initAuth();

    if (authService.isAvailable()) {
      const { data } = authService.onAuthStateChange((user) => {
        if (mounted) {
          setCurrentUser(user);
          if (user && isAuthModalOpen) {
            setIsAuthModalOpen(false);
            setShowAccountPanel(true);
          }
        }
      });

      return () => {
        mounted = false;
        data.subscription.unsubscribe();
      };
    }

    return () => {
      mounted = false;
    };
  }, [isAuthModalOpen]);

  useEffect(() => {
    autoSyncService.initAutoSync();
    const timer = window.setInterval(() => {
      setSyncStatusSnapshot(getSyncStatus());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const openAuthModal = useCallback((mode: "signin" | "signup" = "signin") => {
    setAuthMode(mode);
    setIsAuthModalOpen(true);
  }, []);

  const handleSignOut = async () => {
    try {
      await authService.signOut();
      setCurrentUser(null);
      setShowAccountPanel(false);
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  // Listen for window size changes
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Load video list
  const loadData = useCallback(async () => {
    try {
      const loadedVideos = await videoDB.getAll();
      loadedVideos.sort(
        (a, b) =>
          new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime(),
      );
      setVideos(loadedVideos);

      if (loadedVideos.length > 0 && !selectedVideoId) {
        setSelectedVideoId(loadedVideos[0].id);
      } else if (loadedVideos.length === 0) {
        setSelectedVideoId(null);
      }
    } catch (err) {
      handleError(err, "Failed to load initial data.");
    }
  }, [selectedVideoId]);

  useEffect(() => {
    loadData();

    // Clear old cache on app load
    clearOldCache().catch((err) => {
      console.error("Failed to clear old cache:", err);
    });

    // Set up periodic cache cleanup (every 24 hours)
    const cacheCleanupInterval = setInterval(
      () => {
        clearOldCache().catch((err) => {
          console.error("Failed to clear old cache:", err);
        });
      },
      24 * 60 * 60 * 1000,
    );

    return () => clearInterval(cacheCleanupInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load data for the selected video
  const loadDataForVideo = useCallback(async (videoId: string) => {
    if (!videoId) return;
    try {
      const [videoSubtitles, videoAnalyses, videoNote] = await Promise.all([
        subtitleDB.get(videoId),
        analysisDB.getByVideoId(videoId),
        noteDB.get(videoId),
      ]);
      if (videoSubtitles) {
        setSubtitles((prev) => ({ ...prev, [videoId]: videoSubtitles }));
      } else {
        setSubtitles((prev) => {
          const newState = { ...prev };
          delete newState[videoId];
          return newState;
        });
      }
      if (videoNote) {
        setNotes((prev) => ({ ...prev, [videoId]: videoNote }));
      }
      setAnalyses((prev) => ({ ...prev, [videoId]: videoAnalyses || [] }));
    } catch (err) {
      handleError(err, `Failed to load data for video ${videoId}.`);
    }
  }, []);

  useEffect(() => {
    if (selectedVideoId) {
      loadDataForVideo(selectedVideoId);
    }
  }, [selectedVideoId, loadDataForVideo]);

  // Error handling
  const handleError = (err: unknown, defaultMessage: string) => {
    const message = err instanceof Error ? err.message : defaultMessage;
    setError(message);
    setTimeout(() => setError(null), 5000);
  };

  const {
    status: syncState,
    queueLength,
    lastSyncTime,
    lastError,
  } = syncStatusSnapshot;
  const showSyncStatus =
    syncState !== "idle" ||
    queueLength > 0 ||
    Boolean(lastSyncTime) ||
    Boolean(lastError);
  const formattedLastSync = lastSyncTime
    ? lastSyncTime.toLocaleTimeString()
    : null;
  let syncPrimaryMessage = "";
  if (syncState === "syncing") {
    syncPrimaryMessage = "🔄 正在同步到云端...";
  } else if (syncState === "error") {
    syncPrimaryMessage = `❌ ${lastError ?? "同步失败，正在重试..."}`;
  } else {
    syncPrimaryMessage = "✅ 云端已同步";
  }

  // Import a single video
  const handleSingleVideoImport = async (
    file: File,
    folderPath?: string,
    subtitleFile?: File,
  ) => {
    try {
      const metadata = await getVideoMetadata(file);
      // Generate a deterministic UUID based on file path and timestamp
      const fileIdentifier = `${folderPath ? folderPath + "/" : ""}${file.name}-${file.lastModified}`;
      const videoId = await generateDeterministicUUID(fileIdentifier);

      const newVideo: Video = {
        id: videoId,
        file,
        name: file.name,
        size: file.size,
        folderPath,
        ...metadata,
        importedAt: new Date().toISOString(),
      };
      if (videos.some((v) => v.id === newVideo.id)) {
        console.warn(
          `Video "${newVideo.name}" from "${folderPath}" already imported.`,
        );
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
              const newSubtitles: Subtitles = {
                id: newVideo.id,
                videoId: newVideo.id,
                segments,
              };
              await saveSubtitles(newVideo.id, newSubtitles);
              resolve();
            } catch (err) {
              reject(err);
            }
          };
          reader.onerror = () =>
            reject(new Error("Failed to read subtitle file."));
          reader.readAsText(subtitleFile);
        });
        dbPromises.push(subtitlePromise);
      }
      await Promise.all(dbPromises);
      setVideos((prev) => {
        const updated = [newVideo, ...prev];
        updated.sort(
          (a, b) =>
            new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime(),
        );
        return updated;
      });
      setSelectedVideoId(newVideo.id);
    } catch (err) {
      handleError(err, `Failed to import video: ${file.name}`);
    }
  };

  // Import multiple files
  const handleFileImports = async (files: FileList) => {
    if (!files || files.length === 0) return;
    try {
      const allFiles = Array.from(files);
      const videoFiles = allFiles.filter((f) => f.type.startsWith("video/"));
      const subtitleFiles = allFiles.filter(
        (f) => f.name.endsWith(".srt") || f.name.endsWith(".vtt"),
      );
      if (videoFiles.length === 0) {
        handleError(
          new Error("No video files found in selection."),
          "No videos found.",
        );
        return;
      }
      const videoSubPairs = videoFiles.map((videoFile) => {
        const videoName = videoFile.name.substring(
          0,
          videoFile.name.lastIndexOf("."),
        );
        const matchingSubtitle = subtitleFiles.find((subFile) => {
          const subName = subFile.name.substring(
            0,
            subFile.name.lastIndexOf("."),
          );
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

  // Import folder
  const handleImportFolderSelection = async (files: FileList) => {
    if (!files || files.length === 0) return;
    try {
      const allFiles = Array.from(files);
      const videoFiles: File[] = [];
      const subtitleFiles: File[] = [];
      for (const file of allFiles) {
        if (file.type.startsWith("video/")) {
          videoFiles.push(file);
        } else if (file.name.endsWith(".srt") || file.name.endsWith(".vtt")) {
          subtitleFiles.push(file);
        }
      }
      if (videoFiles.length === 0) {
        handleError(
          new Error("No video files found in the selected folder."),
          "No videos found.",
        );
        return;
      }
      const videoSubPairs = videoFiles.map((videoFile) => {
        const videoName = videoFile.name.substring(
          0,
          videoFile.name.lastIndexOf("."),
        );
        const matchingSubtitle = subtitleFiles.find((subFile) => {
          const subName = subFile.name.substring(
            0,
            subFile.name.lastIndexOf("."),
          );
          const subPath = (subFile as any).webkitRelativePath;
          const videoPath = (videoFile as any).webkitRelativePath;
          const subFolder = subPath.substring(0, subPath.lastIndexOf("/"));
          const videoFolder = videoPath.substring(
            0,
            videoPath.lastIndexOf("/"),
          );
          return subName === videoName && subFolder === videoFolder;
        });
        return { video: videoFile, subtitle: matchingSubtitle };
      });
      for (const { video, subtitle } of videoSubPairs) {
        const relativePath = (video as any).webkitRelativePath || video.name;
        const folderPath = relativePath.substring(
          0,
          relativePath.lastIndexOf("/"),
        );
        await handleSingleVideoImport(video, folderPath, subtitle);
      }
    } catch (err) {
      handleError(err, "An error occurred while importing the folder.");
    }
  };

  // Delete video
  const handleDeleteVideo = async (videoId: string) => {
    const videoToDelete = videos.find((v) => v.id === videoId);
    if (!videoToDelete) return;
    if (window.confirm(t("deleteVideoConfirmation", videoToDelete.name))) {
      try {
        await appDB.deleteVideo(videoId);
        const remainingVideos = videos.filter((v) => v.id !== videoId);
        setVideos(remainingVideos);
        if (selectedVideoId === videoId) {
          setSelectedVideoId(
            remainingVideos.length > 0 ? remainingVideos[0].id : null,
          );
        }
      } catch (err) {
        handleError(err, "Failed to delete video.");
      }
    }
  };

  // Delete folder
  const handleDeleteFolder = async (folderPath: string) => {
    const videosInFolder = videos.filter((v) => v.folderPath === folderPath);
    if (videosInFolder.length === 0) return;
    if (
      window.confirm(
        t("deleteFolderConfirmation", folderPath, videosInFolder.length),
      )
    ) {
      try {
        await Promise.all(videosInFolder.map((v) => appDB.deleteVideo(v.id)));
        const remainingVideos = videos.filter(
          (v) => v.folderPath !== folderPath,
        );
        setVideos(remainingVideos);
        const isSelectedVideoDeleted = videosInFolder.some(
          (v) => v.id === selectedVideoId,
        );
        if (isSelectedVideoDeleted) {
          setSelectedVideoId(
            remainingVideos.length > 0 ? remainingVideos[0].id : null,
          );
        }
      } catch (err) {
        handleError(err, "Failed to delete folder.");
      }
    }
  };

  // Save settings
  const handleSaveSettings = async (newSettings: APISettings) => {
    try {
      await settingsDB.put(newSettings);
      const updatedSettings = await getEffectiveSettings();
      onSettingsChange(updatedSettings);
      setIsSettingsModalOpen(false);
    } catch (err) {
      handleError(err, "Failed to save settings.");
    }
  };

  // Show feedback modal after first insight generation
  const handleFirstTimeInsightSuccess = () => {
    const feedbackShown = localStorage.getItem("insightReelFeedbackShown");
    if (!feedbackShown) {
      setIsFeedbackModalOpen(true);
      localStorage.setItem("insightReelFeedbackShown", "true");
    }
  };

  const selectedVideo = videos.find((v) => v.id === selectedVideoId);

  return (
    <div className="min-h-screen w-screen flex font-sans antialiased relative bg-[#F7F8FA] text-slate-700">
      {/* Error Popup */}
      {error && (
        <div
          className="absolute top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg z-50"
          role="alert"
        >
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      {/* Settings Modal */}
      {isSettingsModalOpen && settings && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setIsSettingsModalOpen(false)}
        />
      )}
      {/* Feedback Modal */}
      {isFeedbackModalOpen && (
        <FeedbackModal
          onClose={() => setIsFeedbackModalOpen(false)}
          feedbackUrl="https://n1ddxc0sfaq.feishu.cn/share/base/form/shrcnf7gC1S58t8Av4x4eNxWSlh"
        />
      )}
      {/* Auth Modal */}
      {isAuthModalOpen && (
        <AuthModal
          isOpen={isAuthModalOpen}
          initialMode={authMode}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={() => {
            setIsAuthModalOpen(false);
            setShowAccountPanel(true);
          }}
        />
      )}
      {/* Account Panel */}
      {showAccountPanel && currentUser && (
        <div
          className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center p-4"
          onClick={() => setShowAccountPanel(false)}
        >
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <AccountPanel user={currentUser} onSignOut={handleSignOut} />
          </div>
        </div>
      )}
      {videos.length > 0 && selectedVideo ? (
        <>
          {/* Desktop Sidebar */}
          <div className="hidden lg:block fixed top-0 left-0 h-full z-30 p-5 pr-0 pb-5">
            <Sidebar
              videos={videos}
              selectedVideoId={selectedVideoId}
              onSelectVideo={setSelectedVideoId}
              onImportFiles={handleFileImports}
              onImportFolderSelection={handleImportFolderSelection}
              isCollapsed={isSidebarCollapsed}
              onToggle={() => setIsSidebarCollapsed((prev) => !prev)}
              onOpenSettings={() => setIsSettingsModalOpen(true)}
              onDeleteFolder={handleDeleteFolder}
              isMobile={false}
              onOpenAuth={() => openAuthModal("signin")}
              onOpenAccount={() => setShowAccountPanel(true)}
              currentUser={currentUser}
            />
          </div>

          {/* Mobile Sidebar */}
          {isMobile && (
            <>
              <div
                className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-300 ${isMobileSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                onClick={() => setIsMobileSidebarOpen(false)}
              ></div>
              <div
                className={`fixed top-0 left-0 h-full z-50 p-5 pr-0 pb-5 transition-transform duration-300 ease-in-out transform ${isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
              >
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
                  onOpenAuth={() => {
                    openAuthModal("signin");
                    setIsMobileSidebarOpen(false);
                  }}
                  onOpenAccount={() => {
                    setShowAccountPanel(true);
                    setIsMobileSidebarOpen(false);
                  }}
                  currentUser={currentUser}
                />
              </div>
            </>
          )}

          {/* Main Content Area */}
          <main
            className={`flex-1 overflow-y-auto transition-all duration-300 ease-in-out ${isSidebarCollapsed ? "lg:pl-[5.25rem]" : "lg:pl-[17.25rem]"}`}
          >
            <div className="w-full max-w-[1800px] mx-auto px-4 lg:px-8 xl:px-12 min-h-full flex flex-col">
              <div className="flex-1">
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
              </div>
              <Footer />
            </div>
          </main>

          {/* Mobile Floating Menu Button */}
          {isMobile && (
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="fixed bottom-6 left-6 z-30 w-12 h-12 rounded-full bg-white/80 backdrop-blur-md text-slate-700 shadow-lg border border-slate-200/50 hover:bg-white/90 hover:shadow-xl active:scale-95 transition-all duration-200 flex items-center justify-center"
              aria-label="Open menu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          )}
        </>
      ) : (
        <div className="flex-1 flex flex-col min-h-full">
          <div className="flex-1 h-1.5">
            <WelcomeScreen
              onImportFiles={handleFileImports}
              onImportFolderSelection={handleImportFolderSelection}
              onLogin={() => openAuthModal("signin")}
              onRegister={() => openAuthModal("signup")}
              onOpenAccount={() => setShowAccountPanel(true)}
              currentUser={currentUser}
            />
          </div>
          <Footer />
        </div>
      )}
      {showSyncStatus && (
        <div className="fixed top-6 right-6 z-40">
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 text-slate-100 px-4 py-3 shadow-2xl backdrop-blur-lg min-w-[220px]">
            <p className="text-sm font-medium tracking-wide">
              {syncPrimaryMessage}
              {queueLength > 0 && `（${queueLength} 项待同步）`}
            </p>
            {syncState === "error" && lastError && (
              <p className="text-xs text-red-200 mt-1 leading-relaxed">
                {lastError}
              </p>
            )}
            {formattedLastSync && syncState !== "error" && (
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                最后同步：{formattedLastSync}
              </p>
            )}
          </div>
        </div>
      )}
      {/* Task Queue Panel - Floating task status indicator */}
      <TaskQueuePanel />
    </div>
  );
};

// Root Component
const App: React.FC = () => {
  const [settings, setSettings] = useState<APISettings | null>(null);
  useEffect(() => {
    const loadInitialSettings = async () => {
      try {
        const effectiveSettings = await getEffectiveSettings();
        setSettings(effectiveSettings);
      } catch (err) {
        console.error("Failed to load settings:", err);
        setSettings({
          id: "user-settings",
          provider: "gemini",
          model: "gemini-2.5-flash",
          language: "en",
        });
      }
    };
    loadInitialSettings();
  }, []);

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-screen w-screen">
        Loading...
      </div>
    );
  }

  return (
    <LanguageProvider language={settings.language || "en"}>
      <AppContent settings={settings} onSettingsChange={setSettings} />
    </LanguageProvider>
  );
};

export default App;
