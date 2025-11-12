import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { authService, Profile } from '../services/authService';
import { syncService } from '../services/syncService';
import { exportService } from '../services/exportService';

interface AccountPanelProps {
  user: User;
  onSignOut: () => void;
}

const AccountPanel: React.FC<AccountPanelProps> = ({ user, onSignOut }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

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
          `✓ Synced: ${videos} videos, ${subtitles} subtitles, ${analyses} analyses, ${notes} notes, ${chats} chats`
        );
        setLastSyncTime(new Date().toISOString());
      } else {
        setSyncMessage(`✗ Error: ${result.error}`);
      }

      setTimeout(() => setSyncMessage(null), 5000);
    } catch (error) {
      setSyncMessage(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = async (includeVideos: boolean) => {
    setExporting(true);

    try {
      await exportService.exportAllDataAndDownload(includeVideos);
      setSyncMessage('✓ Export completed successfully');
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (error) {
      setSyncMessage(`✗ Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setExporting(false);
    }
  };

  const formatLastSync = (isoString: string | null) => {
    if (!isoString) return 'Never';

    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Account</h2>
          <p className="text-sm text-gray-600 mt-1">{user.email}</p>
          {profile?.full_name && (
            <p className="text-sm text-gray-500">{profile.full_name}</p>
          )}
        </div>
        <button
          onClick={onSignOut}
          className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          Sign Out
        </button>
      </div>

      {syncMessage && (
        <div className={`p-3 rounded-lg text-sm ${
          syncMessage.startsWith('✓')
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {syncMessage}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Cloud Sync</h3>
          <p className="text-xs text-gray-500 mb-3">
            Last synced: {formatLastSync(lastSyncTime)}
          </p>
          <p className="text-xs text-gray-500 mb-3">
            ⚠️ Note: Video files are NOT synced (they stay local). Only metadata, subtitles, analyses, notes, and chat history are synced.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleSync('upload')}
              disabled={syncing}
              className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {syncing ? 'Syncing...' : 'Upload to Cloud'}
            </button>

            <button
              onClick={() => handleSync('download')}
              disabled={syncing}
              className="flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l-3-3m0 0l3-3m-3 3h12" />
              </svg>
              {syncing ? 'Syncing...' : 'Download from Cloud'}
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Export Data</h3>
          <div className="space-y-2">
            <button
              onClick={() => handleExport(false)}
              disabled={exporting}
              className="w-full flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {exporting ? 'Exporting...' : 'Export Data Only (JSON)'}
            </button>

            <button
              onClick={() => handleExport(true)}
              disabled={exporting}
              className="w-full flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {exporting ? 'Exporting...' : 'Export All (with Videos, ZIP)'}
            </button>

            <p className="text-xs text-gray-500 mt-2">
              💡 Tip: Export with videos creates a complete backup including video files.
            </p>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          <strong>Storage Limits (Free Tier):</strong><br />
          • Database: 500MB<br />
          • Files: 1GB (not used for videos)<br />
          • Bandwidth: 10GB/month
        </p>
      </div>
    </div>
  );
};

export default AccountPanel;
