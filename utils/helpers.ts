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
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
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
            // Request JPEG for smaller size, 0.8 is a good quality/size balance
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
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