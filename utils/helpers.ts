import { SubtitleSegment } from '../types';

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // remove prefix `data:*/*;base64,`
      resolve(result.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
  });

/**
 * Extract audio from video file and convert to base64
 * This significantly reduces file size for subtitle generation (audio-only vs full video)
 * Optimized for large videos (up to 2GB) with lower bitrate and chunked processing
 */
export const extractAudioToBase64 = async (
  videoFile: File,
  onProgress?: (progress: number) => void
): Promise<{ data: string; mimeType: string; sizeKB: number }> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = false;
    
    const cleanup = () => {
      if (video.src) {
        URL.revokeObjectURL(video.src);
      }
    };

    video.onloadedmetadata = async () => {
      try {
        onProgress?.(10);
        
        const videoDurationMin = video.duration / 60;
        const MAX_EXTRACT_DURATION_MIN = 30; // Maximum 30 minutes of audio to extract
        
        // For very long videos, warn user and limit extraction
        if (videoDurationMin > MAX_EXTRACT_DURATION_MIN) {
          console.warn(`Video is ${videoDurationMin.toFixed(1)} minutes long. Will extract first ${MAX_EXTRACT_DURATION_MIN} minutes only to ensure reasonable processing time.`);
        }
        
        // Create audio context with lower sample rate for better compression
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 16000, // Lower sample rate (16kHz is sufficient for speech recognition)
        });
        const source = audioContext.createMediaElementSource(video);
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        
        onProgress?.(20);
        
        // Determine optimal bitrate based on video size
        const fileSizeMB = videoFile.size / (1024 * 1024);
        let audioBitsPerSecond = 24000; // Default: 24kbps for very low bitrate
        
        if (fileSizeMB < 100) {
          audioBitsPerSecond = 32000; // 32kbps for smaller files
        } else if (fileSizeMB < 500) {
          audioBitsPerSecond = 24000; // 24kbps for medium files
        } else {
          audioBitsPerSecond = 16000; // 16kbps for large files (>500MB)
        }
        
        console.log(`Video size: ${fileSizeMB.toFixed(1)}MB, using audio bitrate: ${audioBitsPerSecond}bps`);
        
        // Create MediaRecorder with optimized settings for large files
        const mediaRecorder = new MediaRecorder(destination.stream, {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond, // Lower bitrate for smaller file size
        });
        
        const chunks: Blob[] = [];
        let totalChunkSize = 0;
        const MAX_AUDIO_SIZE_MB = 20; // Target max audio size in MB
        let audioLimitReached = false;
        
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
            totalChunkSize += e.data.size;
            
            // Monitor audio size and stop if getting too large
            const currentSizeMB = totalChunkSize / (1024 * 1024);
            if (currentSizeMB > MAX_AUDIO_SIZE_MB && !audioLimitReached) {
              audioLimitReached = true;
              console.warn(`Audio extraction size (${currentSizeMB.toFixed(1)}MB) exceeds ${MAX_AUDIO_SIZE_MB}MB limit. Stopping extraction early.`);
              
              // Stop recording early to prevent excessive audio size
              if (mediaRecorder.state === 'recording') {
                video.pause();
                mediaRecorder.stop();
              }
            }
          }
        };
        
        mediaRecorder.onstop = async () => {
          onProgress?.(80);
          
          const audioBlob = new Blob(chunks, { type: 'audio/webm' });
          const sizeKB = Math.round(audioBlob.size / 1024);
          const sizeMB = sizeKB / 1024;
          
          console.log(`Audio extracted: ${sizeKB}KB (${sizeMB.toFixed(2)}MB) from ${fileSizeMB.toFixed(1)}MB video`);
          
          // Check if audio is too large (>20MB might cause API issues)
          if (sizeMB > MAX_AUDIO_SIZE_MB) {
            console.warn(`Extracted audio is ${sizeMB.toFixed(1)}MB, which may be too large for some APIs`);
          }
          
          // Convert blob to base64 with chunked reading for memory efficiency
          const reader = new FileReader();
          reader.onload = () => {
            const base64String = (reader.result as string).split(',')[1];
            onProgress?.(100);
            cleanup();
            audioContext.close();
            resolve({
              data: base64String,
              mimeType: 'audio/webm',
              sizeKB
            });
          };
          reader.onerror = () => {
            cleanup();
            audioContext.close();
            reject(new Error('Failed to convert audio to base64'));
          };
          reader.readAsDataURL(audioBlob);
        };
        
        mediaRecorder.onerror = (e) => {
          cleanup();
          audioContext.close();
          reject(new Error('MediaRecorder error: ' + e));
        };
        
        // Start recording with time slicing for better memory management
        // Request data every 10 seconds to avoid memory buildup
        mediaRecorder.start(10000);
        onProgress?.(30);
        
        // Adaptive playback rate based on video duration
        // For long videos, use higher speed to reduce extraction time
        let playbackRate = 2.0; // Default: 2x speed
        if (video.duration > 600) {
          playbackRate = 4.0; // 4x for videos > 10min
        } else if (video.duration > 300) {
          playbackRate = 3.0; // 3x for videos > 5min
        }
        
        console.log(`Using ${playbackRate}x playback speed for ${(video.duration / 60).toFixed(1)}min video (extraction time: ~${(video.duration / playbackRate / 60).toFixed(1)}min)`);
        video.playbackRate = playbackRate;
        
        // Play video to record audio
        await video.play();
        
        // Track progress during playback
        const progressInterval = setInterval(() => {
          if (video.duration > 0) {
            const playbackProgress = (video.currentTime / video.duration) * 50; // 0-50% of progress
            onProgress?.(30 + Math.round(playbackProgress));
          }
        }, 500);
        
        // Wait for video to end or just record the audio
        video.onended = () => {
          clearInterval(progressInterval);
          onProgress?.(70);
          mediaRecorder.stop();
        };
        
        // Calculate max extraction time
        const MAX_EXTRACT_DURATION_SEC = 30 * 60; // 30 minutes max
        const maxExtractionTime = Math.min(video.duration, MAX_EXTRACT_DURATION_SEC);
        const actualExtractionTime = maxExtractionTime / playbackRate;
        
        // Timer to stop after max duration
        const maxDurationTimer = setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            console.log(`Reached max extraction duration (${(maxExtractionTime / 60).toFixed(1)}min of video). Stopping...`);
            clearInterval(progressInterval);
            video.pause();
            mediaRecorder.stop();
          }
        }, actualExtractionTime * 1000);
        
        // Safety timeout: stop after calculated time + buffer
        setTimeout(() => {
          clearInterval(progressInterval);
          clearTimeout(maxDurationTimer);
          if (mediaRecorder.state === 'recording') {
            console.log('Audio extraction timeout reached, stopping...');
            mediaRecorder.stop();
          }
        }, (actualExtractionTime + 5) * 1000);
        
      } catch (err) {
        cleanup();
        reject(new Error(`Failed to extract audio: ${err instanceof Error ? err.message : String(err)}`));
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Could not load video for audio extraction'));
    };

    video.src = URL.createObjectURL(videoFile);
  });
};

export const getVideoMetadata = (file: File): Promise<{ duration: number; width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    const cleanup = () => {
      if (video.src) {
        window.URL.revokeObjectURL(video.src);
      }
    };
    
    video.onloadedmetadata = () => {
      cleanup();
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };
    
    video.onerror = (e) => {
      cleanup();
      console.error('Video metadata loading error:', e);
      console.error('File info:', { name: file.name, type: file.type, size: file.size });
      reject(new Error(`Failed to load video metadata. File: ${file.name}, Type: ${file.type}. The file might be corrupt or in an unsupported format.`));
    };
    
    try {
      video.src = URL.createObjectURL(file);
    } catch (error) {
      cleanup();
      reject(new Error(`Failed to create object URL for video file: ${error}`));
    }
  });
};

export const extractFramesFromVideo = (
  videoFile: File,
  maxFrames: number,
  onProgress: (progress: number) => void
): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const frames: string[] = [];

    if (!ctx) {
      return reject(new Error('Canvas context is not available.'));
    }

    video.preload = 'metadata';
    video.muted = true;
    
    const revokeUrl = () => {
        if (video.src) {
             URL.revokeObjectURL(video.src);
        }
    };

    video.onloadedmetadata = async () => {
      // Limit canvas size to reduce frame size for API transmission
      // Max 720p to balance quality and size
      const maxWidth = 1280;
      const maxHeight = 720;
      
      let width = video.videoWidth;
      let height = video.videoHeight;
      
      // Scale down if necessary
      if (width > maxWidth || height > maxHeight) {
        const aspectRatio = width / height;
        if (width > height) {
          width = maxWidth;
          height = Math.round(maxWidth / aspectRatio);
        } else {
          height = maxHeight;
          width = Math.round(maxHeight * aspectRatio);
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      const duration = video.duration;
      // Ensure we don't have an interval of 0 for short videos and don't go beyond duration
      const interval = duration > maxFrames ? duration / maxFrames : duration > 1 ? 1 : duration;
      const effectiveMaxFrames = Math.min(maxFrames, Math.floor(duration / (interval > 0 ? interval : 1)));
      let processedFrames = 0;

      const capture = (time: number): Promise<void> => {
        return new Promise((resolveSeek, rejectSeek) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            // Request JPEG for smaller size, 0.6 quality to keep total size under 4.5MB
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            frames.push(dataUrl.split(',')[1]); // Send only base64 data
            processedFrames++;
            onProgress(Math.round((processedFrames / effectiveMaxFrames) * 100));
            resolveSeek();
          };
           const onError = () => {
              video.removeEventListener('seeked', onSeeked);
              video.removeEventListener('error', onError);
              rejectSeek(new Error('A seek operation failed during frame extraction.'));
           }
          video.addEventListener('seeked', onSeeked, { once: true });
          video.addEventListener('error', onError, { once: true });
          video.currentTime = time;
        });
      };
      
      try {
        // Some browsers require the video to have started playing to seek properly
        await video.play();
        video.pause();

        for (let i = 0; i < effectiveMaxFrames; i++) {
          const time = i * interval;
          if (time > duration) break;
          await capture(time);
        }
        revokeUrl();
        resolve(frames);

      } catch (err) {
        revokeUrl();
        reject(new Error(`Failed during frame extraction: ${err instanceof Error ? err.message : String(err)}`));
      }
    };

    video.onerror = () => {
      revokeUrl();
      reject(new Error('Could not load video metadata. File may be corrupt or unsupported.'));
    };
    
    video.src = URL.createObjectURL(videoFile);
  });
};


const parseSrtTimestamp = (timestamp: string): number => {
    const parts = timestamp.split(':');
    if (parts.length !== 3) return 0;
    const [h, m, sCombined] = parts;
    
    const sAndMs = sCombined.replace(',', '.').split('.');
    const s = sAndMs[0];
    const ms = sAndMs[1] || '0';

    const parsedH = parseInt(h, 10);
    const parsedM = parseInt(m, 10);
    const parsedS = parseInt(s, 10);
    // Pad ms to 3 digits and slice to ensure it's max 3 digits before parsing
    const parsedMs = parseInt(ms.padEnd(3, '0').slice(0, 3), 10);

    if (isNaN(parsedH) || isNaN(parsedM) || isNaN(parsedS) || isNaN(parsedMs)) {
        return 0;
    }
    
    return parsedH * 3600 + parsedM * 60 + parsedS + parsedMs / 1000;
};

export const parseSrt = (content: string): SubtitleSegment[] => {
    const lines = content.replace(/\r/g, '').split('\n\n');
    return lines.map((line) => {
        const parts = line.split('\n');
        if (parts.length < 3) return null;
        const timeMatch = parts[1].split(' --> ');
        if (timeMatch.length < 2) return null;
        
        return {
            startTime: parseSrtTimestamp(timeMatch[0]),
            endTime: parseSrtTimestamp(timeMatch[1]),
            text: parts.slice(2).join('\n'),
        };
    }).filter((s): s is SubtitleSegment => s !== null);
};

const parseVttTimestamp = (timestamp: string): number => {
    const parts = timestamp.split(':');
    let time = 0;
    if (parts.length === 3) {
        time += parseFloat(parts[0]) * 3600;
        time += parseFloat(parts[1]) * 60;
        time += parseFloat(parts[2]);
    } else {
        time += parseFloat(parts[0]) * 60;
        time += parseFloat(parts[1]);
    }
    return time;
};

export const parseVtt = (content: string): SubtitleSegment[] => {
    const lines = content.replace(/\r/g, '').split('\n\n');
    return lines.slice(1).map((line) => {
        const parts = line.split('\n');
        if (parts.length < 2) return null;
        const timeMatch = parts[0].split(' --> ');
        if (timeMatch.length < 2) return null;

        return {
            startTime: parseVttTimestamp(timeMatch[0]),
            endTime: parseVttTimestamp(timeMatch[1].split(' ')[0]), // remove alignment tags
            text: parts.slice(1).join('\n'),
        };
    }).filter((s): s is SubtitleSegment => s !== null);
};

export const parseSubtitleFile = (fileName: string, content: string): SubtitleSegment[] => {
    if (fileName.endsWith('.srt')) {
        return parseSrt(content);
    }
    if (fileName.endsWith('.vtt')) {
        return parseVtt(content);
    }
    throw new Error('Unsupported subtitle format. Only .srt and .vtt are supported.');
};


export const formatTimestamp = (seconds: number): string => {
    if (isNaN(seconds)) return '00:00:00';
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};

export const parseTimestampToSeconds = (timestamp: string): number => {
    const parts = timestamp.split(':').map(part => parseInt(part, 10));
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
     if (parts.length === 2) { // Handle MM:SS format
        return parts[0] * 60 + parts[1];
    }
    return 0;
};

export const downloadFile = (content: string, fileName: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const formatSrtTimestamp = (seconds: number): string => {
    if (isNaN(seconds)) seconds = 0;
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    const ms = Math.round((seconds % 1) * 1000).toString().padStart(3, '0');
    return `${h}:${m}:${s},${ms}`;
};

export const segmentsToSrt = (segments: SubtitleSegment[]): string => {
  return segments.map((segment, index) => {
    const startTime = formatSrtTimestamp(segment.startTime);
    const endTime = formatSrtTimestamp(segment.endTime);
    return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text}`;
  }).join('\n\n');
};