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
  
  // 🎯 多种方法检测音频轨道，提高可靠性
  const detectionMethods: Array<{ name: string; result: boolean | null }> = [];
  
  // 方法1: Firefox 的 mozHasAudio
  if (typeof anyVideo.mozHasAudio === 'boolean') {
    const result = anyVideo.mozHasAudio;
    detectionMethods.push({ name: 'mozHasAudio', result });
    if (result) {
      console.log('[Audio Detection] ✅ Detected audio track via mozHasAudio');
      return true;
    }
  }

  // 方法2: Chrome/Safari 的 webkitAudioDecodedByteCount
  if (typeof anyVideo.webkitAudioDecodedByteCount === 'number') {
    const result = anyVideo.webkitAudioDecodedByteCount > 0;
    detectionMethods.push({ name: 'webkitAudioDecodedByteCount', result });
    if (result) {
      console.log('[Audio Detection] ✅ Detected audio track via webkitAudioDecodedByteCount:', anyVideo.webkitAudioDecodedByteCount);
      return true;
    }
  }

  // 方法3: 标准的 audioTracks API
  if (anyVideo.audioTracks && typeof anyVideo.audioTracks.length === 'number') {
    const result = anyVideo.audioTracks.length > 0;
    detectionMethods.push({ name: 'audioTracks.length', result });
    if (result) {
      console.log('[Audio Detection] ✅ Detected audio track via audioTracks:', anyVideo.audioTracks.length);
      return true;
    }
  }
  
  // 方法4: 检查 video 元素是否有 audio 属性（某些浏览器）
  if (anyVideo.audio !== undefined) {
    const result = Boolean(anyVideo.audio);
    detectionMethods.push({ name: 'video.audio', result });
    if (result) {
      console.log('[Audio Detection] ✅ Detected audio track via video.audio');
      return true;
    }
  }

  // 方法5: 检查是否有音频上下文（通过尝试创建）
  // 注意：这个方法可能不准确，因为即使没有音频轨道也可能创建上下文
  
  // 记录所有检测方法的结果
  if (detectionMethods.length > 0) {
    console.log('[Audio Detection] Detection methods results:', detectionMethods);
    // 如果所有方法都返回 false，才返回 false
    const allFalse = detectionMethods.every(m => m.result === false);
    if (allFalse) {
      console.warn('[Audio Detection] ⚠️ All detection methods returned false. May be false negative.');
      // 对于长视频，即使检测失败也假设有音频（可能是检测方法不支持）
      return false; // 返回 false，但上层逻辑会根据视频长度强制使用音频管道
    }
  } else {
    console.warn('[Audio Detection] ⚠️ No detection methods available. Assuming audio exists.');
  }

  // 🎯 默认返回 true：如果无法检测，假设有音频轨道
  // 这样可以让音频分析来最终判断，而不是在这里就否定
  console.log('[Audio Detection] ℹ️ No reliable detection method found. Defaulting to true (will verify via audio analysis).');
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

    let averageLoudness = 0;
    let peakLoudness = 0;
    let silenceRatio = 1;
    let sampledWindowSeconds = 0;
    
    // 🎯 暂时不在这里检测hasAudioTrack，因为音频数据还没加载
    // 将在音频数据加载后再检测
    let hasAudioTrack = false;

    try {
      const AudioContextCls = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!AudioContextCls) {
        throw new Error('AudioContext is not supported in this environment.');
      }

      // 🎯 关键修复：在分析音频前，确保视频数据已加载
      // preload='metadata' 只加载元数据，不加载音频数据
      // 我们需要等待足够的数据加载才能进行音频分析
      console.log('[Audio Analysis] 🔄 Waiting for audio data to load... (readyState:', video.readyState, ')');
      
      // 如果readyState < HAVE_FUTURE_DATA (3)，需要等待更多数据
      if (video.readyState < 3) {
        // 临时改变preload以加载音频数据
        video.preload = 'auto';
        
        // 等待canplay事件（readyState >= HAVE_FUTURE_DATA）
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            console.warn('[Audio Analysis] ⚠️ Timeout waiting for audio data. Proceeding anyway...');
            resolve();
          }, 5000); // 5秒超时
          
          const onCanPlay = () => {
            clearTimeout(timeoutId);
            console.log('[Audio Analysis] ✅ Audio data loaded (readyState:', video.readyState, ')');
            resolve();
          };
          
          const onError = () => {
            clearTimeout(timeoutId);
            console.warn('[Audio Analysis] ⚠️ Error loading audio data');
            resolve(); // 不要reject，继续尝试分析
          };
          
          video.addEventListener('canplay', onCanPlay, { once: true });
          video.addEventListener('error', onError, { once: true });
          
          // 如果已经可以播放了，立即resolve
          if (video.readyState >= 3) {
            clearTimeout(timeoutId);
            video.removeEventListener('canplay', onCanPlay);
            video.removeEventListener('error', onError);
            console.log('[Audio Analysis] ✅ Audio data already loaded (readyState:', video.readyState, ')');
            resolve();
          } else {
            // 触发加载
            video.load();
          }
        });
      } else {
        console.log('[Audio Analysis] ✅ Audio data already available (readyState:', video.readyState, ')');
      }

      // 🎯 现在音频数据已加载，可以进行准确的音频轨道检测了
      hasAudioTrack = inferHasAudioTrack(video);
      console.log('[Audio Analysis] Audio track detection after data loaded:', hasAudioTrack);

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
          
          // 🎯 关键修复：等待视频seek完成并真正开始播放
          // 不要使用固定超时，而是等待'seeked'和'playing'事件
          await new Promise<void>((resolve) => {
            let seeked = false;
            let playing = false;
            const timeoutId = setTimeout(() => {
              console.warn('[Audio Analysis] ⚠️ Timeout waiting for video to start playing at position', segmentStartTime);
              resolve();
            }, 3000);
            
            const checkReady = () => {
              if (seeked && playing) {
                clearTimeout(timeoutId);
                // 再等待一小段时间让音频缓冲区填充
                setTimeout(resolve, 300);
              }
            };
            
            const onSeeked = () => {
              seeked = true;
              console.log('[Audio Analysis] ✅ Seeked to position', video.currentTime);
              checkReady();
            };
            
            const onPlaying = () => {
              playing = true;
              console.log('[Audio Analysis] ✅ Video playing at position', video.currentTime);
              checkReady();
            };
            
            video.addEventListener('seeked', onSeeked, { once: true });
            video.addEventListener('playing', onPlaying, { once: true });
            
            // 开始播放
            video.play().catch((err) => {
              console.warn('[Audio Analysis] ⚠️ Play failed:', err);
              clearTimeout(timeoutId);
              resolve(); // 即使失败也继续
            });
          });

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
          // 对于长视频，降低阈值以避免误判
          const duration = metadata.duration || 0;
          const peakThreshold = duration > 1800 ? 0.015 : 0.02; // 长视频降低阈值
          const avgThreshold = duration > 1800 ? 0.003 : 0.005; // 长视频降低阈值
          
          const hasSignificantAudio = peakLoudness > peakThreshold || averageLoudness > avgThreshold;
          
          // 🎯 重要：如果初始检测到有音频轨道（inferHasAudioTrack），即使采样数据不理想也保持为true
          // 因为可能是采样位置恰好是静音部分，而不是真的没有音频
          if (hasAudioTrack) {
            // 初始检测有音频，即使采样数据不理想也保持为true（可能是采样位置问题）
            if (!hasSignificantAudio) {
              console.warn('[Audio Analysis] ⚠️ Initial detection found audio track, but samples show low amplitude. May be sampling issue. Keeping hasAudioTrack=true.');
            }
            // 保持 hasAudioTrack = true
          } else {
            // 初始检测没有音频，但采样数据有信号，更新为true
            hasAudioTrack = hasSignificantAudio;
          }
          
          console.log('[Audio Analysis]', {
            samples: amplitudeSamples.length,
            averageLoudness: averageLoudness.toFixed(4),
            peakLoudness: peakLoudness.toFixed(4),
            silentThreshold: silentThreshold.toFixed(4),
            silenceRatio: (silenceRatio * 100).toFixed(1) + '%',
            hasAudioTrack,
            samplePositions: samplePositions.length,
            hasSignificantAudio,
            peakThreshold: peakThreshold.toFixed(4),
            avgThreshold: avgThreshold.toFixed(4)
          });
        } else {
          // 没有采样数据，保持初始检测结果
          console.warn('[Audio Analysis] ⚠️ No samples collected. Keeping initial hasAudioTrack value:', hasAudioTrack);
        }

        video.pause();
      }

      await audioContext.close();
    } catch (error) {
      console.warn('[Audio Analysis] Audio analysis failed:', error);
      // 🎯 改进：如果音频分析失败，不要直接假设没有音频轨道
      // 对于长视频，可能是分析超时或其他技术问题，而不是真的没有音频
      // 保持 hasAudioTrack 的初始值（从 inferHasAudioTrack 获取），不要强制设为 false
      // 这样可以让上层逻辑根据视频长度决定是否强制使用音频管道
      if (amplitudeSamples.length === 0) {
        // 只有在完全没有采样数据时才重置
        console.warn('[Audio Analysis] No samples collected. Keeping initial hasAudioTrack value:', hasAudioTrack);
        // 不强制设置 hasAudioTrack = false，保持初始检测结果
      }
      // 如果已经有采样数据，保持现有的 averageLoudness 和 peakLoudness
      if (amplitudeSamples.length === 0) {
        averageLoudness = 0;
        peakLoudness = 0;
        silenceRatio = 1;
      }
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
