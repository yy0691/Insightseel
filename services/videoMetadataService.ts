import { formatTimestamp } from '../utils/helpers';

export type PipelineRecommendation = 'audio' | 'visual' | 'hybrid';

export interface VideoMetadataProfile {
  duration: number;
  width: number;
  height: number;
  hasAudioTrack: boolean;
  averageLoudness: number;
  peakLoudness: number;
  silenceRatio: number;
  recommendedPipeline: PipelineRecommendation;
  sampledWindowSeconds: number;
}

interface AnalyzeMetadataOptions {
  /**
   * Maximum amount of video (in seconds) to analyse for audio loudness. The
   * video is played back at an accelerated speed so the actual wall-clock time
   * is significantly smaller.
   */
  maxAnalysisSeconds?: number;
}

function inferHasAudioTrack(video: HTMLVideoElement): boolean {
  const anyVideo = video as any;

  if (typeof anyVideo.mozHasAudio === 'boolean') {
    return anyVideo.mozHasAudio;
  }

  if (typeof anyVideo.webkitAudioDecodedByteCount === 'number') {
    return anyVideo.webkitAudioDecodedByteCount > 0;
  }

  if (anyVideo.audioTracks && typeof anyVideo.audioTracks.length === 'number') {
    return anyVideo.audioTracks.length > 0;
  }

  return true;
}

export async function analyzeVideoMetadata(
  file: File,
  options: AnalyzeMetadataOptions = {},
): Promise<VideoMetadataProfile> {
  const { maxAnalysisSeconds = 18 } = options;

  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;

  const objectUrl = URL.createObjectURL(file);

  try {
    const metadata = await new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
      video.onloadedmetadata = () => {
        resolve({ duration: video.duration || 0, width: video.videoWidth || 0, height: video.videoHeight || 0 });
      };
      video.onerror = () => {
        reject(new Error('Failed to load video metadata.'));
      };
      video.src = objectUrl;
    });

    let hasAudioTrack = inferHasAudioTrack(video);
    let averageLoudness = 0;
    let peakLoudness = 0;
    let silenceRatio = 1;
    let sampledWindowSeconds = 0;

    try {
      const AudioContextCls = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!AudioContextCls) {
        throw new Error('AudioContext is not supported in this environment.');
      }

      const audioContext = new AudioContextCls();
      const source = audioContext.createMediaElementSource(video);
      const analyser = audioContext.createAnalyser();
      const gain = audioContext.createGain();

      analyser.fftSize = 2048;
      gain.gain.value = 0; // Avoid audible playback while still allowing analysis

      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(audioContext.destination);

      const dataArray = new Uint8Array(analyser.fftSize);
      const amplitudeSamples: number[] = [];

      const effectiveAnalysisSeconds = Math.min(metadata.duration || maxAnalysisSeconds, maxAnalysisSeconds);
      if (effectiveAnalysisSeconds > 0) {
        const playbackRate = metadata.duration > 600 ? 4 : metadata.duration > 300 ? 3 : 2;
        sampledWindowSeconds = effectiveAnalysisSeconds;

        video.currentTime = Math.min(metadata.duration * 0.05, Math.max(0, metadata.duration - effectiveAnalysisSeconds));
        video.playbackRate = playbackRate;

        await audioContext.resume().catch(() => {});
        await video.play().catch(() => {});

        const wallClockLimit = (effectiveAnalysisSeconds / playbackRate) * 1000;
        const startTime = performance.now();

        while (performance.now() - startTime < wallClockLimit && !video.ended) {
          analyser.getByteTimeDomainData(dataArray);

          let sum = 0;
          let max = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const normalized = (dataArray[i] - 128) / 128;
            const amplitude = Math.abs(normalized);
            sum += amplitude;
            if (amplitude > max) {
              max = amplitude;
            }
          }

          const averageAmplitude = sum / dataArray.length;
          amplitudeSamples.push(averageAmplitude);
          if (max > peakLoudness) {
            peakLoudness = max;
          }

          await new Promise((resolve) => setTimeout(resolve, 120));
        }

        averageLoudness = amplitudeSamples.length
          ? amplitudeSamples.reduce((acc, value) => acc + value, 0) / amplitudeSamples.length
          : 0;

        const silentThreshold = 0.015;
        const silentCount = amplitudeSamples.filter((sample) => sample < silentThreshold).length;
        silenceRatio = amplitudeSamples.length ? silentCount / amplitudeSamples.length : 1;

        if (amplitudeSamples.length > 0) {
          hasAudioTrack = hasAudioTrack && amplitudeSamples.some((sample) => sample > silentThreshold);
        }

        video.pause();
      }

      await audioContext.close();
    } catch (error) {
      console.warn('Audio analysis failed, falling back to visual pipeline heuristics:', error);
      hasAudioTrack = hasAudioTrack && false;
      averageLoudness = 0;
      peakLoudness = 0;
      silenceRatio = 1;
    }

    const recommendedPipeline: PipelineRecommendation = (() => {
      if (!hasAudioTrack || averageLoudness < 0.01 || silenceRatio > 0.75) {
        return 'visual';
      }
      if (averageLoudness < 0.035 || silenceRatio > 0.45) {
        return 'hybrid';
      }
      return 'audio';
    })();

    return {
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      hasAudioTrack,
      averageLoudness,
      peakLoudness,
      silenceRatio,
      recommendedPipeline,
      sampledWindowSeconds,
    };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

export function describeAudioProfile(profile: VideoMetadataProfile): string {
  const loudness = profile.averageLoudness.toFixed(3);
  const silence = `${Math.round(profile.silenceRatio * 100)}%`;
  const durationText = formatTimestamp(profile.duration);

  return `Duration: ${durationText}, Avg Loudness: ${loudness}, Silence Ratio: ${silence}, Pipeline: ${profile.recommendedPipeline}`;
}
