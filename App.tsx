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
import { exchangeCodeForToken, getLinuxDoUserInfo, verifyState } from "./services/linuxDoAuthService";

const SUPPORTED_SUBTITLE_EXTENSIONS = [".srt", ".vtt"];

const isSubtitleFileName = (name: string) => {
  const lower = name.toLowerCase();
  return SUPPORTED_SUBTITLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

interface FileInfo {
  file: File;
  folderPath: string;
  normalizedBaseName: string;
}

interface VideoSubtitlePair {
  video: File;
  subtitle?: File;
  folderPath?: string;
}

const getRelativePath = (file: File): string => {
  const relativePath = (file as any).webkitRelativePath as string | undefined;
  return relativePath && relativePath.length > 0 ? relativePath : file.name;
};

const extractFileInfo = (file: File): FileInfo => {
  const relativePath = getRelativePath(file);
  const lastSlash = relativePath.lastIndexOf("/");
  const folderPath = lastSlash >= 0 ? relativePath.substring(0, lastSlash) : "";
  const name = file.name;
  const dotIndex = name.lastIndexOf(".");
  const baseName = dotIndex > 0 ? name.substring(0, dotIndex) : name;
  return {
    file,
    folderPath,
    normalizedBaseName: baseName.toLowerCase(),
  };
};

const findBestSubtitleMatch = (
  videoInfo: FileInfo,
  subtitleInfos: FileInfo[],
  usedSubtitleIndices: Set<number>,
): FileInfo | undefined => {
  if (subtitleInfos.length === 0) return undefined;

  const available = subtitleInfos
    .map((info, index) => ({ info, index }))
    .filter(({ index }) => !usedSubtitleIndices.has(index));

  if (available.length === 0) return undefined;

  const sameFolder = available.filter(
    ({ info }) => info.folderPath === videoInfo.folderPath,
  );

  const searchPool = sameFolder.length > 0 ? sameFolder : available;
  const videoBase = videoInfo.normalizedBaseName;

  const prefixMatched = searchPool
    .filter(({ info }) => {
      const name = info.normalizedBaseName;
      if (name === videoBase) return true;
      return (
        name.startsWith(`${videoBase}.`) ||
        name.startsWith(`${videoBase}_`) ||
        name.startsWith(`${videoBase}-`) ||
        name.startsWith(`${videoBase} `)
      );
    })
    .sort(
      (a, b) =>
        a.info.normalizedBaseName.length - b.info.normalizedBaseName.length,
    );

  if (prefixMatched.length > 0) {
    const chosen = prefixMatched[0];
    usedSubtitleIndices.add(chosen.index);
    return chosen.info;
  }

  if (sameFolder.length === 1) {
    const chosen = sameFolder[0];
    usedSubtitleIndices.add(chosen.index);
    return chosen.info;
  }

  if (searchPool.length === 1) {
    const chosen = searchPool[0];
    usedSubtitleIndices.add(chosen.index);
    return chosen.info;
  }

  return undefined;
};

const pairVideosWithSubtitles = (
  videoFiles: File[],
  subtitleFiles: File[],
): VideoSubtitlePair[] => {
  if (videoFiles.length === 0) return [];

  const subtitleInfos = subtitleFiles.map(extractFileInfo);
  const usedSubtitleIndices = new Set<number>();

  return videoFiles.map((videoFile) => {
    const videoInfo = extractFileInfo(videoFile);
    const matchedSubtitle = findBestSubtitleMatch(
      videoInfo,
      subtitleInfos,
      usedSubtitleIndices,
    );

    return {
      video: videoFile,
      subtitle: matchedSubtitle?.file,
      folderPath: videoInfo.folderPath.length > 0 ? videoInfo.folderPath : undefined,
    };
  });
};

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

  // Migrate Linux.do data from local storage to profile when user logs in
  useEffect(() => {
    const migrateLinuxDoData = async () => {
      if (!currentUser || !authService.isAvailable()) return;

      try {
        const storedData = localStorage.getItem('linuxdo_oauth_data');
        if (!storedData) return;

        const linuxDoData = JSON.parse(storedData);
        
        // Check if profile already has Linux.do data
        const profile = await authService.getProfile(currentUser.id);
        if (profile?.linuxdo_user_id) {
          // Already migrated, remove from local storage
          localStorage.removeItem('linuxdo_oauth_data');
          return;
        }

        // Migrate to profile
        const profileUpdates: Partial<import('./services/authService').Profile> = {
          linuxdo_user_id: linuxDoData.user_id,
          linuxdo_username: linuxDoData.username,
          linuxdo_access_token: linuxDoData.access_token,
          linuxdo_token_expires_at: linuxDoData.token_expires_at,
          linuxdo_user_data: linuxDoData.user_data,
        };

        // Remove undefined values
        Object.keys(profileUpdates).forEach(key => {
          if (profileUpdates[key as keyof typeof profileUpdates] === undefined) {
            delete profileUpdates[key as keyof typeof profileUpdates];
          }
        });

        await authService.updateProfile(currentUser.id, profileUpdates);
        localStorage.removeItem('linuxdo_oauth_data');
        console.log('Linux.do data migrated from local storage to profile');
      } catch (error) {
        console.error('Error migrating Linux.do data:', error);
      }
    };

    migrateLinuxDoData();
  }, [currentUser]);

  // Handle Linux.do OAuth callback
  useEffect(() => {
    const handleLinuxDoCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');

      // Check if this is a Linux.do OAuth callback (has code or error parameter)
      if (code || error) {
        // Clean up URL by removing query parameters
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);

        if (error) {
          console.error('Linux.do OAuth error:', error);
          setError(`Linux.do 登录失败: ${error}`);
          setTimeout(() => setError(null), 5000);
          return;
        }

        if (!code || !state) {
          console.error('Missing code or state in OAuth callback');
          setError('Linux.do 登录回调参数不完整');
          setTimeout(() => setError(null), 5000);
          return;
        }

        // Verify state
        if (!verifyState(state)) {
          console.error('Invalid state parameter');
          setError('Linux.do 登录验证失败：状态参数不匹配');
          setTimeout(() => setError(null), 5000);
          return;
        }

        try {
          // Exchange code for token
          const redirectUri = `${window.location.origin}/auth/linuxdo/callback`;
          const tokenData = await exchangeCodeForToken(code, redirectUri);

          // Get user info
          const userInfo = await getLinuxDoUserInfo(tokenData.access_token);

          console.log('Linux.do OAuth success:', { tokenData, userInfo });

          // Save Linux.do information to profile
          if (currentUser) {
            // User is already logged in to Supabase, update their profile
            try {
              const profileUpdates: Partial<import('./services/authService').Profile> = {
                linuxdo_user_id: userInfo.id?.toString() || userInfo.user_id?.toString() || undefined,
                linuxdo_username: userInfo.username || userInfo.name || undefined,
                linuxdo_access_token: tokenData.access_token,
                linuxdo_token_expires_at: tokenData.expires_in 
                  ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
                  : undefined,
                linuxdo_user_data: userInfo,
              };

              // Remove undefined values
              Object.keys(profileUpdates).forEach(key => {
                if (profileUpdates[key as keyof typeof profileUpdates] === undefined) {
                  delete profileUpdates[key as keyof typeof profileUpdates];
                }
              });

              await authService.updateProfile(currentUser.id, profileUpdates);
              console.log('Linux.do information saved to profile');
            } catch (profileError) {
              console.error('Error saving Linux.do info to profile:', profileError);
              // Continue anyway, don't fail the OAuth flow
            }
          } else {
            // User is not logged in to Supabase
            // Store in local storage for later use
            try {
              const linuxDoData = {
                user_id: userInfo.id?.toString() || userInfo.user_id?.toString(),
                username: userInfo.username || userInfo.name,
                access_token: tokenData.access_token,
                token_expires_at: tokenData.expires_in 
                  ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
                  : undefined,
                user_data: userInfo,
              };
              localStorage.setItem('linuxdo_oauth_data', JSON.stringify(linuxDoData));
              console.log('Linux.do information saved to local storage (user not logged in)');
            } catch (storageError) {
              console.error('Error saving Linux.do info to local storage:', storageError);
            }
          }

          setError(null);
          // 显示成功消息
          setError('✓ Linux.do 登录成功！');
          setTimeout(() => {
            setError(null);
            // 刷新页面以更新 UI
            window.location.reload();
          }, 2000);
        } catch (err) {
          console.error('Linux.do OAuth callback error:', err);
          setError(err instanceof Error ? err.message : 'Linux.do 登录处理失败');
          setTimeout(() => setError(null), 5000);
        }
      }
    };

    handleLinuxDoCallback();
  }, [currentUser]);

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
      const subtitleFiles = allFiles.filter((f) => isSubtitleFileName(f.name));
      if (videoFiles.length === 0) {
        handleError(
          new Error("No video files found in selection."),
          "No videos found.",
        );
        return;
      }

      const videoSubPairs = pairVideosWithSubtitles(videoFiles, subtitleFiles);
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
      const videoFiles = allFiles.filter((file) => file.type.startsWith("video/"));
      const subtitleFiles = allFiles.filter((file) => isSubtitleFileName(file.name));
      if (videoFiles.length === 0) {
        handleError(
          new Error("No video files found in the selected folder."),
          "No videos found.",
        );
        return;
      }
      const videoSubPairs = pairVideosWithSubtitles(videoFiles, subtitleFiles);
      for (const { video, subtitle, folderPath } of videoSubPairs) {
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
    <div className="min-h-screen w-screen flex font-sans relative bg-gradient-to-br from-slate-50 to-slate-200">
      {/* Error Popup */}
      {error && (
        <div
          role="alert"
          onClick={() => setError(null)}   // ← 点击即可关闭
          className="
            fixed top-5 right-5 z-50 cursor-pointer
            flex items-start gap-3
            rounded-2xl
            border border-slate-900/60
            bg-slate-900/90
            px-5 py-4
            shadow-xl shadow-slate-900/40
            backdrop-blur-md
            text-slate-50
            max-w-sm
            transition-all
            hover:bg-slate-900
            active:scale-95
          "
        >
          {/* 左侧图标 */}
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-600/20">
            <span className="text-lg leading-none text-rose-400">✕</span>
          </div>

          {/* 文案 */}
          <div className="flex-1">
            <p className="text-xs font-semibold tracking-wide text-slate-100">
              出错了
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-200/90">
              {error}
            </p>
          </div>
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
              onDeleteVideo={handleDeleteVideo}
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
                  onDeleteVideo={handleDeleteVideo}
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
