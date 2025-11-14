/**
 * Content Script - Runs on every web page
 * Detects videos and communicates with popup
 */

// Import video sidebar injector
import { injectVideoSidebar } from './video-sidebar-injector';
import type { PageVideoInfo, SubtitleTrack, VideoSource } from '../shared/types';

const SUBTITLE_KINDS = new Set(['subtitles', 'captions', 'descriptions']);

function uniqueSubtitleTracks(tracks: SubtitleTrack[]): SubtitleTrack[] {
  const seen = new Set<string>();
  const unique: SubtitleTrack[] = [];

  tracks.forEach((track) => {
    const key = `${track.language || 'und'}-${track.label || 'label'}-${track.src || ''}-${track.kind}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(track);
    }
  });

  return unique;
}

function extractSubtitleTracks(videoEl: HTMLVideoElement): SubtitleTrack[] {
  const subtitleTracks: SubtitleTrack[] = [];

  // Tracks declared in markup
  const trackElements = videoEl.querySelectorAll('track');
  trackElements.forEach((trackEl) => {
    const kind = (trackEl.getAttribute('kind') || '').toLowerCase();
    if (!SUBTITLE_KINDS.has(kind)) {
      return;
    }

    subtitleTracks.push({
      label: trackEl.getAttribute('label') || trackEl.getAttribute('srclang') || 'Subtitle',
      language: trackEl.getAttribute('srclang') || 'und',
      kind,
      src: trackEl.getAttribute('src') || undefined,
      isDefault: trackEl.hasAttribute('default'),
    });
  });

  // Dynamically attached textTracks (e.g. streaming players)
  const textTracks = Array.from(videoEl.textTracks || []);
  textTracks.forEach((textTrack) => {
    if (!SUBTITLE_KINDS.has(textTrack.kind)) {
      return;
    }

    subtitleTracks.push({
      label: textTrack.label || textTrack.language || 'Subtitle',
      language: textTrack.language || 'und',
      kind: textTrack.kind,
      cues: textTrack.cues?.length,
      mode: textTrack.mode,
    });
  });

  return uniqueSubtitleTracks(subtitleTracks);
}

function detectYouTubeVideo(): VideoSource | null {
  const videoId = new URLSearchParams(window.location.search).get('v');
  if (videoId) {
    return {
      url: `https://www.youtube.com/watch?v=${videoId}`,
      type: 'video/mp4',
      provider: 'youtube',
      title: document.title,
      duration: undefined,
    };
  }
  return null;
}

function detectVimeoVideo(): VideoSource | null {
  const match = window.location.pathname.match(/\/(\d+)/);
  if (match) {
    const videoId = match[1];
    return {
      url: `https://vimeo.com/${videoId}`,
      type: 'video/mp4',
      provider: 'vimeo',
      title: document.title,
      duration: undefined,
    };
  }
  return null;
}

function detectBilibiliVideo(): VideoSource | null {
  // Bilibili video URL patterns: /video/BVxxxxx or b23.tv/xxxxx
  const bvMatch = window.location.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/);
  const b23Match = window.location.pathname.match(/\/video\/([a-zA-Z0-9]+)/);
  
  if (bvMatch || b23Match) {
    const videoId = bvMatch ? bvMatch[1] : (b23Match ? b23Match[1] : null);
    if (videoId) {
      return {
        url: window.location.href,
        type: 'video/mp4',
        provider: 'bilibili',
        title: document.title,
        duration: undefined,
      };
    }
  }
  
  // Also check for video element on Bilibili pages
  if (window.location.hostname.includes('bilibili.com')) {
    const videoElement = document.querySelector('video');
    if (videoElement) {
      return {
        url: window.location.href,
        type: 'video/mp4',
        provider: 'bilibili',
        title: document.title,
        duration: videoElement.duration || undefined,
      };
    }
  }
  
  return null;
}

function detectHTML5Videos(): VideoSource[] {
  const videos: VideoSource[] = [];
  const videoElements = document.querySelectorAll('video');

  videoElements.forEach((videoEl) => {
    const subtitles = extractSubtitleTracks(videoEl as HTMLVideoElement);
    const hasSubtitles = subtitles.length > 0;

    // Check for source elements first
    const sources = videoEl.querySelectorAll('source');
    if (sources.length > 0) {
      sources.forEach((source) => {
        const url = source.src;
        const type = source.type || 'video/mp4';
        if (url) {
          videos.push({
            url,
            type,
            provider: 'html5',
            title: videoEl.title || document.title,
            duration: videoEl.duration || undefined,
            hasSubtitles,
            subtitles,
          });
        }
      });
    } else {
      // If no source elements, check if video has src attribute directly
      const videoSrc = (videoEl as HTMLVideoElement).src;
      if (videoSrc) {
        videos.push({
          url: videoSrc,
          type: videoEl.type || 'video/mp4',
          provider: 'html5',
          title: videoEl.title || document.title,
          duration: videoEl.duration || undefined,
          hasSubtitles,
          subtitles,
        });
      } else {
        // If no src, but video element exists, use current page URL
        // This handles cases like Bilibili where video is loaded dynamically
        videos.push({
          url: window.location.href,
          type: 'video/mp4',
          provider: 'html5',
          title: videoEl.title || document.title,
          duration: videoEl.duration || undefined,
          hasSubtitles,
          subtitles,
        });
      }
    }
  });

  return videos;
}

function detectIframeVideos(): VideoSource[] {
  const videos: VideoSource[] = [];
  const iframes = document.querySelectorAll('iframe');

  iframes.forEach((iframe) => {
    const src = iframe.src;
    if (src) {
      if (src.includes('youtube') || src.includes('youtu.be')) {
        videos.push({
          url: src,
          type: 'video/mp4',
          provider: 'youtube',
          title: iframe.title || document.title,
        });
      } else if (src.includes('vimeo')) {
        videos.push({
          url: src,
          type: 'video/mp4',
          provider: 'vimeo',
          title: iframe.title || document.title,
        });
      }
    }
  });

  return videos;
}

function getPageVideoInfo(): PageVideoInfo {
  const videos: VideoSource[] = [];
  let hasVideo = false;

  // Detect Bilibili (check first as it's a common platform)
  const biliVideo = detectBilibiliVideo();
  if (biliVideo) {
    if (biliVideo.provider === 'bilibili') {
      const videoElement = document.querySelector('video') as HTMLVideoElement | null;
      if (videoElement) {
        const subtitles = extractSubtitleTracks(videoElement);
        biliVideo.hasSubtitles = subtitles.length > 0;
        if (subtitles.length > 0) {
          biliVideo.subtitles = subtitles;
        }
      }
    }
    videos.push(biliVideo);
    hasVideo = true;
  }

  // Detect YouTube
  const ytVideo = detectYouTubeVideo();
  if (ytVideo) {
    videos.push(ytVideo);
    hasVideo = true;
  }

  // Detect Vimeo
  const vmVideo = detectVimeoVideo();
  if (vmVideo) {
    videos.push(vmVideo);
    hasVideo = true;
  }

  // Detect HTML5 videos
  const html5Videos = detectHTML5Videos();
  if (html5Videos.length > 0) {
    videos.push(...html5Videos);
    hasVideo = true;
  }

  // Detect iframes
  const iframeVideos = detectIframeVideos();
  if (iframeVideos.length > 0) {
    videos.push(...iframeVideos);
    hasVideo = true;
  }

  const hasSubtitles =
    videos.some((video) => video.hasSubtitles || (video.subtitles && video.subtitles.length > 0)) ||
    document.querySelectorAll('track[kind="subtitles"], track[kind="captions"]').length > 0;

  return {
    hasVideo,
    hasSubtitles,
    videos: videos.slice(0, 3), // Limit to 3 videos
    pageTitle: document.title,
    pageUrl: window.location.href,
  };
}

function serializeVideoInfo(info: PageVideoInfo): string {
  return JSON.stringify({
    url: info.pageUrl,
    title: info.pageTitle,
    hasVideo: info.hasVideo,
    hasSubtitles: info.hasSubtitles,
    videos: info.videos.map((video) => ({
      url: video.url,
      provider: video.provider,
      duration: video.duration,
      subtitles: video.subtitles?.length || 0,
    })),
  });
}

let lastVideoSignature = '';
let detectionTimeout: number | undefined;

function scheduleVideoDetection() {
  if (detectionTimeout) {
    window.clearTimeout(detectionTimeout);
  }

  detectionTimeout = window.setTimeout(() => {
    const videoInfo = getPageVideoInfo();
    const signature = serializeVideoInfo(videoInfo);

    if (signature !== lastVideoSignature) {
      lastVideoSignature = signature;
      try {
        chrome.runtime.sendMessage(
          { action: 'pageVideoDetected', data: videoInfo },
          () => void chrome.runtime.lastError
        );
      } catch (error) {
        // Ignore errors when popup/background is not listening
      }
    }
  }, 250);
}

function observeVideoChanges() {
  const observer = new MutationObserver(() => scheduleVideoDetection());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'data-src', 'poster'],
  });

  document.addEventListener('loadeddata', scheduleVideoDetection, true);
  document.addEventListener('emptied', scheduleVideoDetection, true);
  document.addEventListener('change', scheduleVideoDetection, true);
}

// Listen for messages from popup and injected scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'detectVideo') {
    const videoInfo = getPageVideoInfo();
    sendResponse(videoInfo);
    return true; // Keep channel open for async response
  } else if (message.action === 'getVideoDetails') {
    const videoElement = document.querySelector('video') as HTMLVideoElement | null;
    if (videoElement) {
      sendResponse({
        duration: videoElement.duration,
        currentTime: videoElement.currentTime,
        title: videoElement.title || document.title,
        subtitles: extractSubtitleTracks(videoElement),
      });
    } else {
      sendResponse(null);
    }
    return true;
  }
  return false;
});

// Notify popup on page load
window.addEventListener('load', () => {
  const videoInfo = getPageVideoInfo();
  chrome.runtime.sendMessage(
    { action: 'pageVideoDetected', data: videoInfo },
    () => {
      // Suppress errors when popup is not open
    }
  ).catch(() => {
    // Popup not open, ignore
  });

  // Auto-inject sidebar for any video page
  const hasVideo = 
    document.querySelector('video') !== null ||
    window.location.hostname.includes('youtube.com') ||
    window.location.hostname.includes('bilibili.com') ||
    window.location.hostname.includes('vimeo.com') ||
    document.querySelector('iframe[src*="youtube"], iframe[src*="vimeo"]') !== null;

  if (hasVideo) {
    setTimeout(() => {
      injectVideoSidebar();
    }, 1500); // Wait for dynamic content to load
  }

  observeVideoChanges();
});

scheduleVideoDetection();
