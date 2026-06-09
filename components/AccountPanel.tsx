import React, { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { authService, type Profile } from "../services/authService";
import { syncService } from "../services/syncService";
import { exportService } from "../services/exportService";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "../hooks/useToastStore";

interface AccountPanelProps {
  user: User;
  onSignOut: () => void;
}

const AccountPanel: React.FC<AccountPanelProps> = ({ user, onSignOut }) => {
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
    setLastSyncTime(syncService.getLastSyncTime());
  }, [user]);

  const loadProfile = async () => {
    const profileData = await authService.getProfile(user.id);
    setProfile(profileData);

    // Sync avatar from OAuth provider if profile doesn't have one
    if (!profileData?.avatar_url && user) {
      authService.syncAvatarFromProvider(user).then(() => {
        // Reload profile after syncing avatar
        authService.getProfile(user.id).then(setProfile);
      }).catch(console.error);
    }
  };

  const handleSync = async (direction: "upload" | "download") => {
    setSyncing(true);

    try {
      const result =
        direction === "upload"
          ? await syncService.syncToCloud(user.id)
          : await syncService.syncFromCloud(user.id);

      if (result.success) {
        const { videos, subtitles, analyses, notes, chats } = result.synced;
        toast.success({ 
          title: t("syncedStats", videos, subtitles, analyses, notes, chats) 
        });
        setLastSyncTime(new Date().toISOString());
      } else {
        toast.error({ 
          title: t("error"), 
          description: result.error 
        });
      }

    } catch (error) {
      toast.error({ 
        title: t("error"), 
        description: error instanceof Error ? error.message : t("anErrorOccurred")
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = async (includeVideos: boolean) => {
    setExporting(true);

    try {
      await exportService.exportAllDataAndDownload(includeVideos);
      toast.success({ title: t("exportSuccess") });
    } catch (error) {
      toast.error({
        title: t("exportFailed"),
        description: error instanceof Error ? error.message : t("anErrorOccurred")
      });
    } finally {
      setExporting(false);
    }
  };

  const formatLastSync = (isoString: string | null) => {
    if (!isoString) return t("neverSynced");

    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return t("justNow");
    if (diffMins < 60) return t("minutesAgo", diffMins);

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return t("hoursAgo", diffHours);

    const diffDays = Math.floor(diffHours / 24);
    return t("daysAgo", diffDays);
  };

  const initial = profile?.full_name || user.email || "";
  const initials =
    initial.trim().length > 0 ? initial.trim()[0]?.toUpperCase() : "U";

  return (
    <div className="w-full max-w-lg rounded-[32px] bg-white/95 shadow-[0_18px_80px_rgba(15,23,42,0.18)] backdrop-blur-sm p-7 space-y-6">
      {/* 头部：账号信息 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* 显示头像，优先使用 profile 中的头像，否则显示首字母 */}
          {profile?.avatar_url ? (
            <img 
              src={profile.avatar_url} 
              alt={profile.full_name || user.email || "User"} 
              className="h-10 w-10 rounded-full object-cover border border-slate-200"
              onError={(e) => {
                // 如果图片加载失败，隐藏图片元素，显示首字母
                (e.target as HTMLImageElement).style.display = 'none';
                const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
          ) : null}
          <div 
            className={`flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white ${profile?.avatar_url ? 'hidden' : ''}`}
          >
            {initials}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {profile?.full_name || t("account")}
            </p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
        </div>
        <button
          onClick={onSignOut}
          className="rounded-full px-3.5 py-1.5 text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
        >
          {t("signOut")}
        </button>
      </div>

      {/* 云同步 */}
      <section className="rounded-2xl bg-slate-50 px-4 py-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-800">
            {t("cloudSync")}
          </h3>
          <span className="text-[11px] text-slate-500">
            {t("lastSynced", formatLastSync(lastSyncTime))}
          </span>
        </div>
        <p className="text-[11px] text-slate-500">
          ⚠️ {t("videoFilesNotSyncedNote")}
        </p>
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            onClick={() => handleSync("upload")}
            disabled={syncing}
            className="flex items-center justify-center rounded-full bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:bg-slate-400 transition"
          >
            {syncing ? t("uploading") : t("uploadToCloud")}
          </button>
          <button
            onClick={() => handleSync("download")}
            disabled={syncing}
            className="flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:bg-slate-200 transition"
          >
            {syncing ? t("downloading") : t("downloadFromCloud")}
          </button>
        </div>
      </section>

      {/* 本地导出 */}
      <section className="rounded-2xl bg-slate-50 px-4 py-3.5 space-y-2">
        <h3 className="text-xs font-semibold text-slate-800">
          {t("localExport")}
        </h3>
        <div className="space-y-2 pt-1">
          <button
            onClick={() => handleExport(false)}
            disabled={exporting}
            className="w-full flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:bg-slate-200 transition"
          >
            {exporting ? t("exporting") : t("exportDataOnly")}
          </button>
          <button
            onClick={() => handleExport(true)}
            disabled={exporting}
            className="w-full flex items-center justify-center rounded-full bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:bg-slate-400 transition"
          >
            {exporting ? t("exporting") : t("exportAll")}
          </button>
          <p className="text-[11px] text-slate-500">
            💡 {t("exportTip")}
          </p>
        </div>
      </section>
      
    </div>
  );
};

export default AccountPanel;
