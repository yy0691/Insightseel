import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { authService } from '../services/authService';
import { syncService } from '../services/syncService';
import { exportService } from '../services/exportService';
import AuthModal from './AuthModal';
import AccountPanel from './AccountPanel';

const SyncExportPanel: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      if (!authService.isAvailable()) {
        setAuthLoading(false);
        return;
      }

      const user = await authService.getCurrentUser();
      if (mounted) {
        setCurrentUser(user);
        setAuthLoading(false);
      }
    };

    initAuth();

    if (authService.isAvailable()) {
      const { data } = authService.onAuthStateChange((user) => {
        if (mounted) {
          setCurrentUser(user);
          if (user) {
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
  }, []);

  const handleSignOut = async () => {
    try {
      await authService.signOut();
      setCurrentUser(null);
      setShowAccountPanel(false);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const handleExport = async (includeVideos: boolean) => {
    setExporting(true);
    setExportMessage(null);

    try {
      await exportService.exportAllDataAndDownload(includeVideos);
      setExportMessage('✓ Export completed successfully');
      setTimeout(() => setExportMessage(null), 3000);
    } catch (error) {
      setExportMessage(`✗ Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setTimeout(() => setExportMessage(null), 5000);
    } finally {
      setExporting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-lg">
        <div className="text-center text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Sync & Export</h2>

      {!authService.isAvailable() && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
          ⚠️ Cloud sync is not available. Supabase credentials not configured.
        </div>
      )}

      {authService.isAvailable() && !currentUser && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800 mb-2">
              <strong>Sign in to enable cloud sync</strong>
            </p>
            <p className="text-xs text-blue-600 mb-4">
              Sync your video metadata, subtitles, analyses, notes, and chat history across devices.
            </p>
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
            >
              Sign In / Create Account
            </button>
            <p className="text-xs text-gray-500 mt-3">
              ⚠️ Video files will NOT be synced (50MB limit per file on free tier).
            </p>
          </div>
        </div>
      )}

      {currentUser && showAccountPanel && (
        <AccountPanel user={currentUser} onSignOut={handleSignOut} />
      )}

      <div className="pt-4 border-t border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Local Export</h3>
        <p className="text-xs text-gray-500 mb-3">
          Export your data to backup locally, even without signing in.
        </p>

        {exportMessage && (
          <div className={`mb-3 p-3 rounded-lg text-sm ${
            exportMessage.startsWith('✓')
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {exportMessage}
          </div>
        )}

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

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={() => {
          setIsAuthModalOpen(false);
          setShowAccountPanel(true);
        }}
      />
    </div>
  );
};

export default SyncExportPanel;
