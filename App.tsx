import React, { useState, useEffect, useCallback } from "react";
// Lazy load heavy components
const VideoDetail = React.lazy(() => import("./components/VideoDetail"));
const SettingsModal = React.lazy(() => import("./components/SettingsModal"));
const FeedbackModal = React.lazy(() => import("./components/FeedbackModal"));
const AuthModal = React.lazy(() => import("./components/AuthModal"));
const AccountPanel = React.lazy(() => import("./components/AccountPanel"));
const TaskQueuePanel = React.lazy(() => import("./components/TaskQueuePanel"));

import Sidebar from "./components/Sidebar";
// import VideoDetail from "./components/VideoDetail"; // Replaced with lazy
import WelcomeScreen from "./components/WelcomeScreen";
// import SettingsModal from "./components/SettingsModal"; // Replaced with lazy
// import FeedbackModal from "./components/FeedbackModal"; // Replaced with lazy
// import AuthModal from "./components/AuthModal"; // Replaced with lazy
// import AccountPanel from "./components/AccountPanel"; // Replaced with lazy
import Footer from "./components/Footer";
// import TaskQueuePanel from "./components/TaskQueuePanel"; // Replaced with lazy
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
import { ToastProvider, toast } from "./hooks/useToastStore";
import { ToastHost } from "./components/ui/ToastHost";
import { clearOldCache } from "./services/cacheService";
import { User } from "@supabase/supabase-js";
import { authService, type Profile } from "./services/authService";
import autoSyncService, { getSyncStatus } from "./services/autoSyncService";
import { saveSubtitles } from "./services/subtitleService";

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

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [linuxDoProfile, setLinuxDoProfile] = useState<Profile | null>(null);
  const [syncStatusSnapshot, setSyncStatusSnapshot] = useState(() =>
    getSyncStatus(),
  );

  const { t } = useLanguage();

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      if (!authService.isAvailable()) return;
      const user = await authService.getCurrentUser();
      if (mounted) {
        setCurrentUser(user);
        // Sync avatar from OAuth provider if user just logged in
        if (user) {
          authService.syncAvatarFromProvider(user).catch(console.error);
        } else {
          // 如果没有 Supabase 用户，检查是否有 Linux.do 登录状态
          const linuxDoProfile = await authService.getLinuxDoLoginStatus();
          if (mounted && linuxDoProfile) {
            setLinuxDoProfile(linuxDoProfile);
            console.log('[App] 检测到 Linux.do 登录状态:', linuxDoProfile);
          }
        }
      }
    };

    initAuth();

    if (authService.isAvailable()) {
      const { data } = authService.onAuthStateChange((user) => {
        if (mounted) {
          setCurrentUser(user);
          // Sync avatar from OAuth provider when user logs in
          if (user) {
            authService.syncAvatarFromProvider(user).catch(console.error);
          }
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
          linuxdo_avatar_url: linuxDoData.avatar_url || linuxDoData.user_data?.avatar_url || linuxDoData.user_data?.avatar,
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

  // Handle Linux.do OAuth callback (使用新的回调服务)
  useEffect(() => {
    const handleLinuxDoCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');

      // 检查是否是 Linux.do OAuth 回调
      if (!code && !error) return;

      // 清理 URL
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);

      // 使用新的回调服务处理
      const { handleLinuxDoCallback: handleCallback } = await import('./services/linuxDoCallbackService');
      const result = await handleCallback(
        { code: code || '', state: state || '', error: error || undefined },
        currentUser
      );

      // 处理结果
      if (result.success && result.profile) {
        // 保存 profile 到状态
        setLinuxDoProfile(result.profile);

        // 确保 localStorage 中有数据（用于页面刷新后恢复状态）
        if (result.profile.linuxdo_user_id) {
          const storedData = localStorage.getItem('linuxdo_oauth_data');
          if (!storedData && result.profile.linuxdo_access_token) {
            // 如果没有保存的数据，创建一个基本的记录
            const linuxDoData = {
              user_id: result.profile.linuxdo_user_id,
              username: result.profile.linuxdo_username || result.profile.full_name,
              avatar_url: result.profile.linuxdo_avatar_url || result.profile.avatar_url,
              access_token: result.profile.linuxdo_access_token,
              token_expires_at: result.profile.linuxdo_token_expires_at,
              user_data: result.profile.linuxdo_user_data,
            };
            localStorage.setItem('linuxdo_oauth_data', JSON.stringify(linuxDoData));
            console.log('[App] 已保存 Linux.do 登录状态到 localStorage');
          }
        }

        toast.success({ title: 'Linux.do 登录成功！' });
        setTimeout(() => window.location.reload(), 2000);
      } else {
        toast.error({
          title: 'Linux.do 登录失败',
          description: result.error || '未知错误',
          duration: 8000,
        });
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
      // Sort by custom order if available, otherwise by import date
      loadedVideos.sort((a, b) => {
        // If both have order field, sort by order
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        // If only one has order, prioritize it
        if (a.order !== undefined) return -1;
        if (b.order !== undefined) return 1;
        // Otherwise sort by import date (newest first)
        return new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime();
      });
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
    toast.error({ title: defaultMessage, description: message });
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

  // Batch delete videos
  const handleBatchDelete = async (videoIds: string[]) => {
    if (videoIds.length === 0) return;

    if (
      window.confirm(
        t("batchDeleteConfirmation", videoIds.length),
      )
    ) {
      try {
        await Promise.all(videoIds.map(id => appDB.deleteVideo(id)));
        const remainingVideos = videos.filter(v => !videoIds.includes(v.id));
        setVideos(remainingVideos);

        // If selected video was deleted, select another one
        if (selectedVideoId && videoIds.includes(selectedVideoId)) {
          setSelectedVideoId(
            remainingVideos.length > 0 ? remainingVideos[0].id : null,
          );
        }
      } catch (err) {
        handleError(err, "Failed to delete selected videos.");
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

  // Handle video reordering from drag and drop
  const handleReorderVideos = async (reorderedVideos: Video[]) => {
    try {
      // Update videos state immediately for responsive UI
      setVideos(reorderedVideos);

      // Save each video's new order to database
      await Promise.all(
        reorderedVideos.map((video) => videoDB.put(video))
      );
    } catch (err) {
      handleError(err, "Failed to save video order.");
      // Reload data on error to restore correct state
      loadData();
    }
  };

  const selectedVideo = videos.find((v) => v.id === selectedVideoId);

  return (
    <div className="min-h-screen w-screen flex font-sans relative bg-gradient-to-br from-slate-50 to-slate-200">
      <ToastHost />



      {/* Settings Modal */}
      {isSettingsModalOpen && settings && (
        <React.Suspense fallback={null}>
          <SettingsModal
            settings={settings}
            onSave={handleSaveSettings}
            onClose={() => setIsSettingsModalOpen(false)}
          />
        </React.Suspense>
      )}
      {/* Feedback Modal */}
      {isFeedbackModalOpen && (
        <React.Suspense fallback={null}>
          <FeedbackModal
            onClose={() => setIsFeedbackModalOpen(false)}
            feedbackUrl="https://n1ddxc0sfaq.feishu.cn/share/base/form/shrcnf7gC1S58t8Av4x4eNxWSlh"
          />
        </React.Suspense>
      )}
      {/* Auth Modal */}
      {isAuthModalOpen && (
        <React.Suspense fallback={null}>
          <AuthModal
            isOpen={isAuthModalOpen}
            initialMode={authMode}
            onClose={() => setIsAuthModalOpen(false)}
            onSuccess={() => {
              setIsAuthModalOpen(false);
              setShowAccountPanel(true);
            }}
          />
        </React.Suspense>
      )}
      {/* Account Panel */}
      {showAccountPanel && currentUser && (
        <div
          className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center p-4"
          onClick={() => setShowAccountPanel(false)}
        >
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <React.Suspense fallback={<div className="bg-white p-4 rounded-xl">Loading...</div>}>
              <AccountPanel user={currentUser} onSignOut={handleSignOut} />
            </React.Suspense>
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
              onBatchDelete={handleBatchDelete}
              onReorderVideos={handleReorderVideos}
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
                  onBatchDelete={handleBatchDelete}
                  onReorderVideos={handleReorderVideos}
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
          <main className={`flex-1 overflow-y-auto transition-all duration-300 ease-in-out ${isSidebarCollapsed ? "lg:pl-20" : "lg:pl-72"}`}>
            <div className="w-full max-w-[1800px] mx-auto px-4 lg:px-8 xl:px-12 min-h-full flex flex-col">
              <div className="flex-1">
                <React.Suspense fallback={
                  <div className="flex items-center justify-center min-h-screen">
                    <div className="text-center">
                      <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin mx-auto mb-2"></div>
                      <p className="text-sm text-slate-500">Loading editor...</p>
                    </div>
                  </div>
                }>
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
                </React.Suspense>
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
      {
        showSyncStatus && (
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
        )
      }
      {/* Task Queue Panel - Floating task status indicator */}
      <TaskQueuePanel />
    </div >
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
    <ToastProvider>
      <LanguageProvider language={settings.language || "en"}>
        <AppContent settings={settings} onSettingsChange={setSettings} />
      </LanguageProvider>
    </ToastProvider>
  );
};

export default App;
