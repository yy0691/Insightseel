import React, { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { authService, type Profile } from "../services/authService";
import { syncService } from "../services/syncService";
import { exportService } from "../services/exportService";
import { buildLinuxDoAuthUrl } from "../services/linuxDoAuthService";
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

  // Linux.do 相关状态（纯前端，负责 UI + 跳转）
  const [linuxDoStatus, setLinuxDoStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");

  useEffect(() => {
    loadProfile();
    setLastSyncTime(syncService.getLastSyncTime());
  }, [user]);

  const loadProfile = async () => {
    const profileData = await authService.getProfile(user.id);
    setProfile(profileData);
    
    // Update Linux.do status based on profile
    if (profileData?.linuxdo_user_id) {
      setLinuxDoStatus("connected");
    }

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

  const handleLinuxDoLogin = async () => {
    if (linuxDoStatus === "connected") return;

    setLinuxDoStatus("connecting");

    try {
      // 构建回调 URL - 使用当前页面的完整路径，确保与注册的回调 URL 完全匹配
      // Linux.do OAuth 要求 redirect_uri 必须完全匹配注册时的 URI
      // ⚠️ 重要：如果 Linux.do 应用中配置的回调 URL 是带尾部斜杠的（如 https://insight.luoyuanai.cn/），
      // 这里也需要包含尾部斜杠；如果配置的是不带斜杠的，这里也不带斜杠
      // 
      // 注意：当 pathname 是 '/' 时，会得到带斜杠的 URL（如 https://insight.luoyuanai.cn/）
      // 如果 Linux.do 应用中配置的是无斜杠的，需要移除尾部斜杠
      let redirectUri = `${window.location.origin}${window.location.pathname}`;
      
      // 🔧 处理尾部斜杠问题
      // ⚠️ 重要：Linux.do OAuth 对 redirect_uri 的匹配非常严格
      // 如果 Linux.do 应用中配置的回调 URL 是带斜杠的（如 https://insight.luoyuanai.cn/），
      // 这里也需要包含尾部斜杠；如果配置的是不带斜杠的，这里也不带斜杠
      // 
      // 默认行为：移除根路径的尾部斜杠（因为大多数 OAuth 提供者期望根路径不带斜杠）
      // 如果 Linux.do 应用中配置的是带斜杠的，请注释掉下面的 if 语句
      const originalRedirectUri = redirectUri;
      if (redirectUri.endsWith('/') && redirectUri.split('/').length === 4) {
        // 只有根路径时才移除尾部斜杠（如 https://insight.luoyuanai.cn/ -> https://insight.luoyuanai.cn）
        redirectUri = redirectUri.slice(0, -1);
      }
      
      console.log('Building Linux.do OAuth URL:');
      console.log('  原始 redirect_uri:', originalRedirectUri);
      console.log('  处理后的 redirect_uri:', redirectUri);
      console.log('⚠️ 请确保此 redirect_uri 与 Linux.do 应用中配置的回调 URL 完全一致（包括尾部斜杠）');
      console.log('💡 如果仍然出现 invalid_request 错误：');
      console.log('   1. 查看控制台中的 "🔍 OAuth 请求诊断信息"');
      console.log('   2. 复制显示的 redirect_uri 值');
      console.log('   3. 登录 Linux.do 开发者控制台，检查 OAuth 应用的回调 URL 配置');
      console.log('   4. 确保回调 URL 与复制的 redirect_uri 完全一致');
      console.log('   5. 如果不一致，修改 Linux.do 应用中的回调 URL 配置');
      
      // 构建授权 URL
      const authUrl = await buildLinuxDoAuthUrl(redirectUri);
      
      // 在当前窗口跳转到授权页面（OAuth 标准流程）
      window.location.href = authUrl;
      
      // 注意：这里不会执行到，因为页面会跳转
    } catch (e) {
      setLinuxDoStatus("disconnected");
      console.error('Linux.do login error:', e);
      
      let errorMessage = '未知错误';
      if (e instanceof Error) {
        errorMessage = e.message;
        
        // 如果是配置错误，提供更详细的帮助信息
        if (errorMessage.includes('Client ID') || errorMessage.includes('未配置')) {
          errorMessage += ' 请检查：1) Supabase 数据库中的 oauth_config 或 app_config 表；2) 环境变量 VITE_LINUXDO_CLIENT_ID；3) 浏览器控制台的详细错误信息。';
        }
      }
      
      toast.error({ 
        title: 'Linux.do 登录失败', 
        description: errorMessage 
      });
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


      {/* Linux.do 登录区 */}
      <section className="rounded-2xl bg-slate-50 px-4 py-3.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Linux.do 头像/Logo */}
            {profile?.linuxdo_avatar_url ? (
              <img 
                src={profile.linuxdo_avatar_url} 
                alt="Linux.do" 
                className="h-8 w-8 rounded-full object-cover border border-slate-200"
                onError={(e) => {
                  // 如果图片加载失败，隐藏图片元素
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center border border-slate-300">
                <svg className="h-4 w-4 text-slate-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2 4h20v16H2V4zm2 2v12h16V6H4zm2 2h12v2H6V8zm0 4h8v2H6v-2z"/>
                  <circle cx="18" cy="10" r="1" fill="currentColor"/>
                  <circle cx="18" cy="14" r="1" fill="currentColor"/>
                </svg>
              </div>
            )}
            <div>
              <h3 className="text-xs font-semibold text-slate-800">
                Linux.do 登录 / 绑定
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {profile?.linuxdo_username 
                  ? `已绑定：${profile.linuxdo_username}`
                  : "用 Linux.do 账号登录，后续可以做账号打通、积分同步等扩展。"}
              </p>
            </div>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
              linuxDoStatus === "connected" || profile?.linuxdo_user_id
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-slate-100 text-slate-600 border border-slate-200"
            }`}
          >
            <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {linuxDoStatus === "connected" || profile?.linuxdo_user_id ? "已连接" : "未连接"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            onClick={handleLinuxDoLogin}
            disabled={linuxDoStatus === "connecting"}
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:bg-slate-400 transition"
          >
            {linuxDoStatus === "connected"
              ? "重新打开 Linux.do"
              : linuxDoStatus === "connecting"
              ? "跳转中…"
              : "用 Linux.do 登录"}
          </button>
          <p className="text-[10px] text-slate-500">
            登录链接会在新窗口打开，不会影响当前页面。
          </p>
        </div>
      </section>

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
