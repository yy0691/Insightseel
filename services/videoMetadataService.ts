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

      // 🎯 根据视频长度动态调整采样时长和位置
      // 对于长视频，从多个位置采样以获得更准确的结果
      const duration = metadata.duration || 0;
      let analysisSeconds = maxAnalysisSeconds;
      
      // 对于长视频（>10分钟），增加采样时长
      if (duration > 600) {
        analysisSeconds = Math.min(30, duration * 0.05); // 最多30秒或视频的5%
      } else if (duration > 300) {
        analysisSeconds = Math.min(24, duration * 0.08); // 最多24秒或视频的8%
      }
      
      const effectiveAnalysisSeconds = Math.min(duration || analysisSeconds, analysisSeconds);
      sampledWindowSeconds = effectiveAnalysisSeconds;

      if (effectiveAnalysisSeconds > 0) {
        const playbackRate = duration > 600 ? 4 : duration > 300 ? 3 : 2;
        
        // 🎯 改进采样位置策略：从视频中间和多个位置采样，而不是末尾
        // 对于访谈类视频，中间部分更可能有对话内容
        const samplePositions: number[] = [];
        
        if (duration > 600) {
          // 长视频：从25%、50%、75%位置采样
          samplePositions.push(duration * 0.25, duration * 0.50, duration * 0.75);
        } else if (duration > 300) {
          // 中等视频：从30%、60%位置采样
          samplePositions.push(duration * 0.30, duration * 0.60);
        } else {
          // 短视频：从中间采样
          samplePositions.push(duration * 0.50);
        }

        // 合并所有采样点的数据
        for (const samplePosition of samplePositions) {
          const segmentDuration = effectiveAnalysisSeconds / samplePositions.length;
          const segmentStartTime = Math.max(0, Math.min(duration - segmentDuration, samplePosition - segmentDuration / 2));
          
          video.currentTime = segmentStartTime;
          video.playbackRate = playbackRate;

          await audioContext.resume().catch(() => {});
          await video.play().catch(() => {});
          
          // 等待视频定位到正确位置
          await new Promise((resolve) => setTimeout(resolve, 200));

          const wallClockLimit = (segmentDuration / playbackRate) * 1000;
          const startTime = performance.now();

          while (performance.now() - startTime < wallClockLimit && !video.ended && video.currentTime < duration) {
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

          video.pause();
          
          // 在采样下一个位置前稍作等待
          if (samplePositions.indexOf(samplePosition) < samplePositions.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }

        averageLoudness = amplitudeSamples.length
          ? amplitudeSamples.reduce((acc, value) => acc + value, 0) / amplitudeSamples.length
          : 0;

        // 🎯 改进静音阈值：使用更智能的阈值检测
        // 基于实际音频数据的分布，而不是固定阈值
        const sortedAmplitudes = [...amplitudeSamples].sort((a, b) => a - b);
        const medianAmplitude = sortedAmplitudes[Math.floor(sortedAmplitudes.length / 2)];
        const q1Amplitude = sortedAmplitudes[Math.floor(sortedAmplitudes.length * 0.25)];
        
        // 动态阈值：使用中位数的30%或Q1，取较大值，但最低不低于0.01
        const silentThreshold = Math.max(0.01, Math.max(medianAmplitude * 0.3, q1Amplitude * 0.5));
        
        const silentCount = amplitudeSamples.filter((sample) => sample < silentThreshold).length;
        silenceRatio = amplitudeSamples.length ? silentCount / amplitudeSamples.length : 1;

        // 🎯 改进hasAudioTrack判断：使用peakLoudness而不是所有样本
        // 只要峰值超过阈值，就认为有音频轨道
        if (amplitudeSamples.length > 0) {
          // 如果peakLoudness > 0.02，肯定有音频
          // 或者如果averageLoudness > 0.005，也认为有音频
          const hasSignificantAudio = peakLoudness > 0.02 || averageLoudness > 0.005;
          hasAudioTrack = hasAudioTrack && hasSignificantAudio;
          
          console.log('[Audio Analysis]', {
            samples: amplitudeSamples.length,
            averageLoudness: averageLoudness.toFixed(4),
            peakLoudness: peakLoudness.toFixed(4),
            silentThreshold: silentThreshold.toFixed(4),
            silenceRatio: (silenceRatio * 100).toFixed(1) + '%',
            hasAudioTrack,
            samplePositions: samplePositions.length
          });
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
