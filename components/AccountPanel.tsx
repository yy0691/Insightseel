import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { authService, Profile } from '../services/authService';
import { syncService } from '../services/syncService';
import { exportService } from '../services/exportService';
import { linuxDoService } from '../services/linuxDoService'; // 新增 Linux.do 服务
import { useLanguage } from '../contexts/LanguageContext';

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
  const [linuxDoLoggedIn, setLinuxDoLoggedIn] = useState(false); // 新增状态，跟踪 Linux.do 登录状态

  useEffect(() => {
    loadProfile();
    setLastSyncTime(syncService.getLastSyncTime());
  }, [user]);

  const loadProfile = async () => {
    const profileData = await authService.getProfile(user.id);
    setProfile(profileData);
  };

  const handleSync = async (direction: 'upload' | 'download') => {
    setSyncing(true);
    setSyncMessage(null);

    try {
      const result = direction === 'upload'
        ? await syncService.syncToCloud(user.id)
        : await syncService.syncFromCloud(user.id);

      if (result.success) {
        const { videos, subtitles, analyses, notes, chats } = result.synced;
        setSyncMessage(
          `✓ ${t('syncedStats', videos, subtitles, analyses, notes, chats)}`
        );
        setLastSyncTime(new Date().toISOString());
      } else {
        setSyncMessage(`✗ ${t('error')}: ${result.error}`);
      }

      setTimeout(() => setSyncMessage(null), 5000);
    } catch (error) {
      setSyncMessage(`✗ ${t('error')}: ${error instanceof Error ? error.message : t('anErrorOccurred')}`);
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = async (includeVideos: boolean) => {
    setExporting(true);

    try {
      await exportService.exportAllDataAndDownload(includeVideos);
      setSyncMessage(`✓ ${t('exportSuccess')}`);
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (error) {
      setSyncMessage(`✗ ${t('exportFailed')}: ${error instanceof Error ? error.message : t('anErrorOccurred')}`);
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setExporting(false);
    }
  };

  const handleLinuxDoLogin = async () => {
    try {
      await linuxDoService.login();  // 调用 Linux.do 登录接口
      setLinuxDoLoggedIn(true);
      setSyncMessage(`✓ ${t('linuxDoLoginSuccess')}`);
    } catch (error) {
      setSyncMessage(`✗ ${t('linuxDoLoginFailed')}: ${error.message}`);
    }
  };

  const formatLastSync = (isoString: string | null) => {
    if (!isoString) return t('neverSynced');

    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return t('justNow');
    if (diffMins < 60) return t('minutesAgo', diffMins);

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return t('hoursAgo', diffHours);

    const diffDays = Math.floor(diffHours / 24);
    return t('daysAgo', diffDays);
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t('account')}</h2>
          <p className="text-sm text-slate-600 mt-1">{user.email}</p>
          {profile?.full_name && (
            <p className="text-sm text-slate-500">{profile.full_name}</p>
          )}
        </div>
        <button
          onClick={onSignOut}
          className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          {t('signOut')}
        </button>
      </div>

      {syncMessage && (
        <div className={`p-3 rounded-lg text-sm ${syncMessage.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {syncMessage}
        </div>
      )}

      {/* Linux.do Login Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('linuxDoLogin')}</h3>
          <button
            onClick={handleLinuxDoLogin}
            className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
            disabled={linuxDoLoggedIn}
          >
            {linuxDoLoggedIn ? t('loggedIn') : t('loginToLinuxDo')}
          </button>
        </div>

        {/* Sync Section */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('cloudSync')}</h3>
          <p className="text-xs text-slate-500 mb-3">
            {t('lastSynced', formatLastSync(lastSyncTime))}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleSync('upload')}
              disabled={syncing}
              className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {syncing ? t('uploading') : t('uploadToCloud')}
            </button>

            <button
              onClick={() => handleSync('download')}
              disabled={syncing}
              className="flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {syncing ? t('downloading') : t('downloadFromCloud')}
            </button>
          </div>
        </div>

        {/* Export Section */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('localExport')}</h3>
          <div className="space-y-2">
            <button
              onClick={() => handleExport(false)}
              disabled={exporting}
              className="w-full flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {exporting ? t('exporting') : t('exportDataOnly')}
            </button>

            <button
              onClick={() => handleExport(true)}
              disabled={exporting}
              className="w-full flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {exporting ? t('exporting') : t('exportAll')}
            </button>

            <p className="text-xs text-slate-500 mt-2">
              💡 {t('exportTip')}
            </p>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-200">
        <p className="text-xs text-slate-500">
          <strong>{t('storageLimitsFree')}</strong><br />
          • {t('storageLimitsDatabase')}<br />
          • {t('storageLimitsFiles')}<br />
          • {t('storageLimitsBandwidth')}
        </p>
      </div>
    </div>
  );
};

export default AccountPanel;
