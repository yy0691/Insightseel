/**
 * 集成视频处理功能到主应用
 * 在 VideoDetail 组件中添加"完整处理"按钮
 */

import React, { useState } from 'react';
import VideoProcessingModal from './VideoProcessingModal';

interface VideoProcessingIntegrationProps {
  videoFile: File;
  videoId: string;
}

export function VideoProcessingIntegration({ videoFile, videoId }: VideoProcessingIntegrationProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
        title="完整视频处理：转写 → 翻译 → 烧录字幕"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
        </svg>
        完整处理
      </button>

      <VideoProcessingModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        videoSource={videoFile}
      />
    </>
  );
}
