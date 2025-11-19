/**
 * Audio Extraction and Compression Service
 * Extracts audio from video files and compresses it to reduce size
 * This allows processing large video files without needing external storage
 */

export interface AudioExtractionOptions {
  onProgress?: (progress: number, stage: string) => void;
  targetBitrate?: number; // Default: 32000 (32 kbps)
  maxDurationSeconds?: number; // Optional: extract only first N seconds
}

export interface AudioExtractionResult {
  audioBlob: Blob;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  duration: number;
}

/**
 * Extract and compress audio from video file
 * Reduces file size significantly while maintaining speech quality
 */
export async function extractAndCompressAudio(
  file: File | Blob,
  options: AudioExtractionOptions = {}
): Promise<AudioExtractionResult> {
  const {
    onProgress,
    targetBitrate = 32000, // 32 kbps - good for speech
    maxDurationSeconds,
  } = options;

  const originalSize = file.size;
  const originalSizeMB = originalSize / (1024 * 1024);

  console.log('[Audio Extraction] Starting audio extraction and compression:', {
    originalSize: `${originalSizeMB.toFixed(2)}MB`,
    targetBitrate: `${targetBitrate / 1000}kbps`,
    maxDuration: maxDurationSeconds ? `${maxDurationSeconds}s` : 'full'
  });

  onProgress?.(0, 'Loading video...');

  // Create video element to load the file
  const video = document.createElement('video');
  const videoUrl = URL.createObjectURL(file);
  video.src = videoUrl;
  video.preload = 'metadata';

  // Wait for video metadata to load
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video metadata'));
  });

  const duration = maxDurationSeconds 
    ? Math.min(video.duration, maxDurationSeconds)
    : video.duration;

  console.log('[Audio Extraction] Video metadata loaded:', {
    totalDuration: `${video.duration.toFixed(1)}s`,
    extractDuration: `${duration.toFixed(1)}s`,
    videoSize: `${originalSizeMB.toFixed(2)}MB`
  });

  onProgress?.(10, 'Extracting audio...');

  try {
    // Create audio context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Decode audio data
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    onProgress?.(40, 'Compressing audio...');

    // Calculate samples to extract based on INPUT sample rate
    const inputSampleRate = audioBuffer.sampleRate;
    const inputSamplesToExtract = Math.min(
      audioBuffer.length,
      Math.floor(duration * inputSampleRate)
    );

    // 🎯 智能采样率选择：根据目标比特率动态调整
    // 关键：降低采样率和位深度以真正减小WAV文件大小
    // WAV文件大小 = 采样率 × 位深度/8 × 声道数 × 时长
    let outputSampleRate = 16000; // 默认16kHz
    if (targetBitrate <= 12000) {
      // ≤12kbps: 目标 ~1.5MB/min，使用8kHz 8-bit mono (64 kbps = 0.5MB/min)
      outputSampleRate = 8000;
    } else if (targetBitrate <= 16000) {
      // ≤16kbps: 目标 ~2MB/min，使用8kHz 16-bit mono (128 kbps = 0.96MB/min)
      outputSampleRate = 8000;
    } else if (targetBitrate <= 20000) {
      // ≤20kbps: 目标 ~2.5MB/min，使用11kHz 16-bit mono (176 kbps = 1.32MB/min)
      outputSampleRate = 11025;
    } else if (targetBitrate <= 24000) {
      // ≤24kbps: 目标 ~3MB/min，使用12kHz 16-bit mono (192 kbps = 1.44MB/min)
      outputSampleRate = 12000;
    } else {
      // >24kbps: 使用16kHz 16-bit mono (256 kbps = 1.92MB/min)
      outputSampleRate = 16000;
    }
    
    // 🔧 重要：计算输出采样数（基于输出采样率）
    const outputSamples = Math.floor(duration * outputSampleRate);
    
    console.log('[Audio Extraction] Using sample rate:', {
      inputSampleRate: `${inputSampleRate}Hz`,
      inputSamples: inputSamplesToExtract,
      targetBitrate: `${targetBitrate / 1000}kbps`,
      outputSampleRate: `${outputSampleRate}Hz`,
      outputSamples: outputSamples,
      duration: `${duration.toFixed(1)}s`,
      estimatedSize: `${(outputSamples * 1 / (1024 * 1024)).toFixed(2)}MB (8-bit mono)`
    });

    // Create offline context for rendering
    const offlineContext = new OfflineAudioContext({
      numberOfChannels: 1, // Mono for smaller size
      length: outputSamples, // 使用输出采样率计算的样本数
      sampleRate: outputSampleRate, // 动态采样率
    });

    // Create buffer source
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0, 0, duration);

    // Render audio
    const renderedBuffer = await offlineContext.startRendering();

    onProgress?.(70, 'Encoding audio...');

    // Convert to WAV format (simple format that Deepgram accepts)
    // 🎯 对于低比特率（≤16kbps），使用8-bit编码以减小文件大小
    // 对于更高比特率，使用16-bit以确保识别质量
    const use8Bit = targetBitrate <= 16000; // 16kbps及以下使用8-bit
    const wavBlob = await audioBufferToWav(renderedBuffer, use8Bit);
    
    if (use8Bit) {
      console.log('[Audio Extraction] Using 8-bit encoding for aggressive compression');
    } else {
      console.log('[Audio Extraction] Using 16-bit encoding for quality');
    }

    onProgress?.(90, 'Finalizing...');

    // If WAV is still too large, we can further compress using Opus if available
    // For now, WAV with mono + 16kHz should be small enough

    const compressedSize = wavBlob.size;
    const compressedSizeMB = compressedSize / (1024 * 1024);
    const compressionRatio = originalSize / compressedSize;

    console.log('[Audio Extraction] Compression complete:', {
      originalSize: `${originalSizeMB.toFixed(2)}MB`,
      compressedSize: `${compressedSizeMB.toFixed(2)}MB`,
      compressionRatio: `${compressionRatio.toFixed(1)}x`,
      savedSpace: `${((1 - compressedSize / originalSize) * 100).toFixed(1)}%`
    });

    // Clean up
    URL.revokeObjectURL(videoUrl);
    await audioContext.close();

    onProgress?.(100, 'Complete');

    return {
      audioBlob: wavBlob,
      originalSize,
      compressedSize,
      compressionRatio,
      duration: renderedBuffer.duration,
    };
  } catch (error) {
    URL.revokeObjectURL(videoUrl);
    console.error('[Audio Extraction] Failed:', error);
    throw new Error(`Failed to extract audio: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Convert AudioBuffer to WAV Blob
 * Uses 8-bit PCM for better compression (语音识别足够)
 */
function audioBufferToWav(buffer: AudioBuffer, use8Bit: boolean = false): Blob {
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  // 🎯 使用8-bit位深度以获得更好的压缩（当采样率<=8kHz时）
  const bitDepth = use8Bit ? 8 : 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;

  const data = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    data.push(buffer.getChannelData(i));
  }

  const dataLength = buffer.length * numberOfChannels * bytesPerSample;
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  // Write WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  // Write audio data
  let offset = 44;
  if (bitDepth === 8) {
    // 8-bit unsigned PCM (0-255, 128 = silence)
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, data[channel][i]));
        const uint8 = Math.round((sample + 1) * 127.5); // Convert -1..1 to 0..255
        view.setUint8(offset, uint8);
        offset += 1;
      }
    }
  } else {
    // 16-bit signed PCM (-32768..32767, 0 = silence)
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, data[channel][i]));
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Check if audio extraction is supported in current browser
 */
export function isAudioExtractionSupported(): boolean {
  return !!(
    (window.AudioContext || (window as any).webkitAudioContext) &&
    window.OfflineAudioContext
  );
}

/**
 * Estimate compressed audio size before extraction
 * Useful for deciding whether to use compression
 */
export function estimateCompressedSize(
  videoSizeMB: number,
  videoDurationSeconds: number,
  targetBitrate: number = 32000
): number {
  // Rough estimation based on target bitrate and duration
  // WAV文件大小 = 采样率 × 位深度/8 × 声道数 × 时长
  // 对于12kbps目标：使用8kHz 8-bit mono ≈ 64 kbps = 8 KB/s = 0.48 MB/min
  // 对于16kbps目标：使用8kHz 16-bit mono ≈ 128 kbps = 16 KB/s = 0.96 MB/min
  // 对于20kbps目标：使用11kHz 16-bit mono ≈ 176 kbps = 22 KB/s = 1.32 MB/min
  // 对于24kbps目标：使用12kHz 16-bit mono ≈ 192 kbps = 24 KB/s = 1.44 MB/min
  // 对于32kbps目标：使用16kHz 16-bit mono ≈ 256 kbps = 32 KB/s = 1.92 MB/min
  
  let mbPerMinute: number;
  if (targetBitrate <= 12000) {
    mbPerMinute = 0.48; // 8kHz 8-bit mono (64 kbps)
  } else if (targetBitrate <= 16000) {
    mbPerMinute = 0.96; // 8kHz 16-bit mono (128 kbps)
  } else if (targetBitrate <= 20000) {
    mbPerMinute = 1.32; // 11kHz 16-bit mono (176 kbps)
  } else if (targetBitrate <= 24000) {
    mbPerMinute = 1.44; // 12kHz 16-bit mono (192 kbps)
  } else {
    mbPerMinute = 1.92; // 16kHz 16-bit mono (256 kbps)
  }
  
  const estimatedSizeMB = (videoDurationSeconds / 60) * mbPerMinute;
  return Math.max(0.5, estimatedSizeMB); // Minimum 0.5 MB
}


