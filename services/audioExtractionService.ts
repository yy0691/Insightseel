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

    // Calculate samples to extract
    const sampleRate = audioBuffer.sampleRate;
    const samplesToExtract = Math.min(
      audioBuffer.length,
      Math.floor(duration * sampleRate)
    );

    // Create offline context for rendering
    const offlineContext = new OfflineAudioContext({
      numberOfChannels: 1, // Mono for smaller size
      length: samplesToExtract,
      sampleRate: 16000, // Lower sample rate for speech (16kHz is sufficient)
    });

    // Create buffer source
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0, 0, duration);

    // Render audio
    const renderedBuffer = await offlineContext.startRendering();

    onProgress?.(70, 'Encoding audio...');

    // Convert to WAV format (simple, lossless format that Deepgram accepts)
    const wavBlob = await audioBufferToWav(renderedBuffer);

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
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

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
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, data[channel][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
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
  videoDurationSeconds: number
): number {
  // Rough estimation:
  // 16kHz mono WAV ≈ 192 kbps (16000 Hz * 2 bytes * 1 channel * 8 bits/byte / 1000)
  // = 24 KB/s = 1.44 MB/min
  const estimatedSizeMB = (videoDurationSeconds / 60) * 1.44;
  return Math.max(0.5, estimatedSizeMB); // Minimum 0.5 MB
}


