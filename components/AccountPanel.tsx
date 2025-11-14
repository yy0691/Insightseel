import React, { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { authService, type Profile } from "../services/authService";
import { syncService } from "../services/syncService";
import { exportService } from "../services/exportService";
import { useLanguage } from "../contexts/LanguageContext";

interface AccountPanelProps {
  user: User;
  onSignOut: () => void;
}

const AccountPanel: React.FC<AccountPanelProps> = ({ user, onSignOut }) => {
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
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
  };

  const handleSync = async (direction: "upload" | "download") => {
    setSyncing(true);
    setSyncMessage(null);

    try {
      const result =
        direction === "upload"
          ? await syncService.syncToCloud(user.id)
          : await syncService.syncFromCloud(user.id);

      if (result.success) {
        const { videos, subtitles, analyses, notes, chats } = result.synced;
        setSyncMessage(
          `✓ ${t("syncedStats", videos, subtitles, analyses, notes, chats)}`
        );
        setLastSyncTime(new Date().toISOString());
      } else {
        setSyncMessage(`✗ ${t("error")}: ${result.error}`);
      }

    } catch (error) {
      setSyncMessage(
        `✗ ${t("error")}: ${
          error instanceof Error ? error.message : t("anErrorOccurred")
        }`
      );
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const handleExport = async (includeVideos: boolean) => {
    setExporting(true);

    try {
      await exportService.exportAllDataAndDownload(includeVideos);
      setSyncMessage(`✓ ${t("exportSuccess")}`);
    } catch (error) {
      setSyncMessage(
        `✗ ${t("exportFailed")}: ${
          error instanceof Error ? error.message : t("anErrorOccurred")
        }`
      );
    } finally {
      setExporting(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  // 这里先做一个“前端入口”：
  // 1）跳到 linux.do 的登录 / 授权页面
  // 2）你后面可以在回调里把 token 写入 profile 或本地存储
  const handleLinuxDoLogin = () => {
    if (linuxDoStatus === "connected") return;

    setLinuxDoStatus("connecting");

    try {
      // 这里根据你实际的 OAuth / SSO 地址改
      const redirectUrl =
        "https://linux.do"; // TODO: 换成你的 linux.do 授权链接，例如 /oauth/authorize

      // 新开窗口，避免直接踢走当前页面
      window.open(redirectUrl, "_blank", "noopener,noreferrer");

      // 纯 UI 标记为已连接，真实绑定你后面自己接回调处理
      setLinuxDoStatus("connected");
      setSyncMessage(`✓ Linux.do 已发起登录/绑定`);
    } catch (e) {
      setLinuxDoStatus("disconnected");
      setSyncMessage(`✗ Linux.do 登录跳转失败`);
    } finally {
      setTimeout(() => setSyncMessage(null), 5000);
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
    <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
      {/* 头部：账号信息 */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200/80">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
            {initials}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {t("account")}
            </h2>
            <p className="text-xs text-slate-600">{user.email}</p>
            {profile?.full_name && (
              <p className="text-[11px] text-slate-500 mt-0.5">
                {profile.full_name}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onSignOut}
          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {t("signOut")}
        </button>
      </div>

      {/* 顶部提示 / 状态条 */}
      {syncMessage && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            syncMessage.startsWith("✓")
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {syncMessage}
        </div>
      )}

      {/* Linux.do 登录区 */}
      <section className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-slate-800">
              Linux.do 登录 / 绑定
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              用 Linux.do 账号登录，后续可以做账号打通、积分同步等扩展。
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
              linuxDoStatus === "connected"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-slate-100 text-slate-600 border border-slate-200"
            }`}
          >
            <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {linuxDoStatus === "connected" ? "已连接" : "未连接"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            onClick={handleLinuxDoLogin}
            disabled={linuxDoStatus === "connecting"}
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
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
      <section className="space-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
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
            className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
          >
            {syncing ? t("uploading") : t("uploadToCloud")}
          </button>
          <button
            onClick={() => handleSync("download")}
            disabled={syncing}
            className="flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:bg-slate-200"
          >
            {syncing ? t("downloading") : t("downloadFromCloud")}
          </button>
        </div>
      </section>

      {/* 本地导出 */}
      <section className="space-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
        <h3 className="text-xs font-semibold text-slate-800">
          {t("localExport")}
        </h3>
        <div className="space-y-2 pt-1">
          <button
            onClick={() => handleExport(false)}
            disabled={exporting}
            className="w-full flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:bg-slate-200"
          >
            {exporting ? t("exporting") : t("exportDataOnly")}
          </button>
          <button
            onClick={() => handleExport(true)}
            disabled={exporting}
            className="w-full flex items-center justify-center rounded-lg border border-slate-200 bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
          >
            {exporting ? t("exporting") : t("exportAll")}
          </button>
          <p className="text-[11px] text-slate-500">
            💡 {t("exportTip")}
          </p>
        </div>
      </section>

      {/* 限额说明 */}
      <section className="border-t border-slate-200 pt-3">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          <strong>{t("storageLimitsFree")}</strong>
          <br />
          • {t("storageLimitsDatabase")}
          <br />
          • {t("storageLimitsFiles")}
          <br />
          • {t("storageLimitsBandwidth")}
        </p>
      </section>
    </div>
  );
};

export default AccountPanel;
