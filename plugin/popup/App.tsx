import React, { useState, useEffect } from 'react';
import { Loader, AlertCircle, Check } from 'lucide-react';
import type { PageVideoInfo, VideoSource } from '../shared/types';
import VideoSelector from './components/VideoSelector';
import AnalysisPanel from './components/AnalysisPanel';
import SettingsPanel from './components/SettingsPanel';

type View = 'main' | 'analysis' | 'settings';

interface SelectedVideo extends VideoSource {
  pageTitle: string;
  pageUrl: string;
}

export default function App() {
  const [view, setView] = useState<View>('main');
  const [videoInfo, setVideoInfo] = useState<PageVideoInfo | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    detectVideo();
  }, []);

  const detectVideo = async () => {
    try {
      setLoading(true);
      setError(null);

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab');

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'detectVideo',
      });

      setVideoInfo(response);

      if (!response.hasVideo) {
        setError('No video found on this page');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to detect video');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVideo = (video: VideoSource) => {
    if (videoInfo) {
      setSelectedVideo({
        ...video,
        pageTitle: videoInfo.pageTitle,
        pageUrl: videoInfo.pageUrl,
      });
      setView('analysis');
    }
  };

  const handleBack = () => {
    setSelectedVideo(null);
    setView('main');
  };

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-md"></div>
            <h1 className="text-sm font-semibold text-gray-900">InsightReel</h1>
          </div>
          {view !== 'main' && (
            <button
              onClick={handleBack}
              className="text-gray-500 hover:text-gray-700 text-xs"
            >
              Back
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader className="w-6 h-6 text-emerald-600 animate-spin" />
            <p className="text-xs text-gray-600">Detecting video...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <AlertCircle className="w-8 h-8 text-amber-500" />
            <p className="text-xs text-gray-600 text-center">{error}</p>
            <button
              onClick={detectVideo}
              className="mt-2 px-3 py-1 bg-emerald-600 text-white text-xs rounded-full hover:bg-emerald-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : view === 'main' ? (
          <>
            {videoInfo && videoInfo.hasVideo && videoInfo.videos.length > 0 ? (
              <VideoSelector
                videos={videoInfo.videos}
                onSelectVideo={handleSelectVideo}
              />
            ) : (
              <div className="text-center py-8">
                <p className="text-xs text-gray-600">No videos detected on this page</p>
              </div>
            )}
          </>
        ) : view === 'analysis' && selectedVideo ? (
          <AnalysisPanel
            video={selectedVideo}
            onClose={handleBack}
          />
        ) : view === 'settings' ? (
          <SettingsPanel onClose={() => setView('main')} />
        ) : null}
      </div>

      {/* Footer with Settings */}
      {view === 'main' && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3">
          <button
            onClick={() => setView('settings')}
            className="w-full px-3 py-2 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200 transition-colors"
          >
            Settings
          </button>
        </div>
      )}
    </div>
  );
}
