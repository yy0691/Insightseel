import React from 'react';
import { Play, Youtube, Video, Globe } from 'lucide-react';
import type { VideoSource } from '../../shared/types';

interface VideoSelectorProps {
  videos: VideoSource[];
  onSelectVideo: (video: VideoSource) => void;
}

const providerIcons: Record<string, React.ReactNode> = {
  youtube: <Youtube className="w-4 h-4" />,
  vimeo: <Video className="w-4 h-4" />,
  html5: <Play className="w-4 h-4" />,
  other: <Globe className="w-4 h-4" />,
};

export default function VideoSelector({ videos, onSelectVideo }: VideoSelectorProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-700 mb-3">
        {videos.length} video{videos.length > 1 ? 's' : ''} found
      </p>

      {videos.map((video, idx) => (
        <button
          key={idx}
          onClick={() => onSelectVideo(video)}
          className="w-full p-3 bg-white rounded-2xl border border-gray-200 hover:border-emerald-300 hover:shadow-sm transition-all text-left group"
        >
          <div className="flex items-start gap-3">
            <div className="mt-1 p-2 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100">
              {providerIcons[video.provider] || providerIcons.other}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">
                {video.title || 'Untitled Video'}
              </p>
              <p className="text-xs text-gray-500 mt-1 capitalize">
                {video.provider}
                {video.duration && ` • ${Math.round(video.duration)}s`}
              </p>
            </div>
            <div className="text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
              <Play className="w-4 h-4" />
            </div>
          </div>
        </button>
      ))}

      {videos.length === 0 && (
        <div className="text-center py-8">
          <p className="text-xs text-gray-500">No videos detected</p>
        </div>
      )}
    </div>
  );
}
