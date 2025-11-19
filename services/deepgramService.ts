/**
 * Deepgram Speech-to-Text Service
 * Professional speech recognition with generous free tier ($200 credits)
 */

import { getEffectiveSettings } from './dbService';
import { fetchWithTimeout, retryWithBackoff } from '../utils/helpers';

// System default Deepgram API key (from environment variable)
// Users can override this in settings
const SYSTEM_DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY;

interface DeepgramResponse {
  metadata: {
    transaction_key: string;
    request_id: string;
    sha256: string;
    created: string;
    duration: number;
    channels: number;
  };
  results: {
    channels: Array<{
      alternatives: Array<{
        transcript: string;
        confidence: number;
        words: Array<{
          word: string;
          start: number;
          end: number;
          confidence: number;
        }>;
      }>;
    }>;
  };
}

interface DeepgramSegment {
  start: number;
  end: number;
  text: string;
}

/**
 * Get the Deepgram API key to use
 * Priority: User's key > System default key
 */
function getDeepgramApiKey(userKey?: string): string | undefined {
  return userKey || SYSTEM_DEEPGRAM_KEY;
}

/**
 * Check if Deepgram API is available and configured
 * Also tests the API key by making a simple validation request
 */
export async function isDeepgramAvailable(): Promise<boolean> {
  const settings = await getEffectiveSettings();
  const apiKey = getDeepgramApiKey(settings.deepgramApiKey);

  if (!apiKey) {
    console.log('[Deepgram] ❌ API Key not configured:', {
      hasUserKey: !!settings.deepgramApiKey,
      hasSystemKey: !!SYSTEM_DEEPGRAM_KEY,
    });
    return false;
  }

  console.log('[Deepgram] 🔍 Checking API Key availability:', {
    hasUserKey: !!settings.deepgramApiKey,
    hasSystemKey: !!SYSTEM_DEEPGRAM_KEY,
    usingKey: settings.deepgramApiKey ? 'user' : 'system',
    keyLength: apiKey.length,
    keyPrefix: apiKey.substring(0, 8) + '...'
  });

  // 🎯 通过 Vercel proxy 验证（避免 CORS 问题）
  // 不再尝试直接调用 Deepgram API 进行验证，因为会遇到 CORS 错误
  try {
    const testResponse = await fetch('/api/deepgram-proxy', {
      method: 'GET',
      headers: {
        'X-Deepgram-API-Key': apiKey,
      },
    });

    if (testResponse.ok) {
      const result = await testResponse.json();
      if (result.valid) {
        console.log('[Deepgram] ✅ API Key is valid (via proxy)');
        return true;
      } else {
        console.warn('[Deepgram] ⚠️ API Key validation failed:', result);
        return false;
      }
    } else {
      const errorData = await testResponse.json().catch(() => ({ error: 'Unknown error' }));
      console.warn('[Deepgram] ⚠️ API Key validation failed:', {
        status: testResponse.status,
        statusText: testResponse.statusText,
        error: errorData.error || errorData
      });
      return false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[Deepgram] ⚠️ Failed to validate API Key (network error, but key exists):', {
      error: errorMessage
    });
    // If network error but key exists, assume it might work (could be temporary network issue)
    // Return true to allow attempt, but log the warning
    return true;
  }
}

/**
 * Check if text is highly repetitive (likely recognition error)
 */
function isRepetitiveText(text: string): boolean {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 3) return false;

  // Check for patterns like "的人的人的人" or "word word word"
  const uniqueWords = new Set(words);
  const repetitionRatio = uniqueWords.size / words.length;

  // If more than 60% of words are duplicates, consider it repetitive
  if (repetitionRatio < 0.4) {
    return true;
  }

  // Check for consecutive identical words (3+ times)
  let consecutiveCount = 1;
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1]) {
      consecutiveCount++;
      if (consecutiveCount >= 3) {
        return true;
      }
    } else {
      consecutiveCount = 1;
    }
  }

  // Check for patterns like "A B A B A B"
  if (words.length >= 6) {
    const pattern = words.slice(0, 2).join(' ');
    let patternMatches = 0;
    for (let i = 0; i < words.length - 1; i += 2) {
      if (words.slice(i, i + 2).join(' ') === pattern) {
        patternMatches++;
      }
    }
    if (patternMatches >= 3) {
      return true;
    }
  }

  return false;
}

/**
 * Log Deepgram response details for debugging
 */
function logDeepgramResponse(result: DeepgramResponse, mode: string): void {
  console.log(`[Deepgram] Transcription complete (${mode})`);
  console.log('[Deepgram] Response metadata:', {
    duration: result.metadata.duration,
    channels: result.metadata.channels,
    requestId: result.metadata.request_id,
  });
  if (result.results.channels && result.results.channels.length > 0) {
    const transcript = result.results.channels[0].alternatives[0]?.transcript || '';
    const words = result.results.channels[0].alternatives[0]?.words || [];
    console.log('[Deepgram] Transcription summary:', {
      transcriptLength: transcript.length,
      transcriptPreview: transcript.substring(0, 200),
      wordCount: words.length,
      firstWords: words.slice(0, 5).map(w => w.word).join(' '),
      lastWords: words.slice(-5).map(w => w.word).join(' '),
    });
    
    // 🔍 调试：检查 transcript 的编码
    if (transcript.length > 0) {
      console.log('[Deepgram] 🔍 Transcript 编码检查:');
      console.log('  前20字符:', transcript.substring(0, 20));
      console.log('  字符编码:', Array.from(transcript.substring(0, 20)).map(c => c.charCodeAt(0)));
      console.log('  是否包含中文:', /[\u4e00-\u9fa5]/.test(transcript));
      console.log('  是否包含英文:', /[a-zA-Z]/.test(transcript));
    }
  }
}

/**
 * Normalize language code for Deepgram API
 * Deepgram uses specific language codes: 'zh' for Chinese, 'en' for English, etc.
 */
function normalizeLanguageCode(language?: string): string | undefined {
  if (!language || language === 'auto') {
    return undefined; // Deepgram will auto-detect
  }

  // Normalize to Deepgram's language codes
  const langLower = language.toLowerCase();
  if (langLower.startsWith('zh')) {
    return 'zh'; // Deepgram uses 'zh' for Chinese
  } else if (langLower.startsWith('en')) {
    return 'en';
  } else if (langLower.startsWith('es')) {
    return 'es';
  } else if (langLower.startsWith('fr')) {
    return 'fr';
  } else if (langLower.startsWith('de')) {
    return 'de';
  } else if (langLower.startsWith('ja')) {
    return 'ja';
  } else if (langLower.startsWith('ko')) {
    return 'ko';
  }

  // For other languages, use as-is (Deepgram may support it)
  return language;
}

/**
 * Generate subtitles using Deepgram API
 * Uses Nova-2 model for best accuracy/cost balance
 */
export async function generateSubtitlesWithDeepgram(
  file: File | Blob,
  language?: string,
  onProgress?: (progress: number) => void,
  abortSignal?: AbortSignal
): Promise<DeepgramResponse> {
  const settings = await getEffectiveSettings();
  const apiKey = getDeepgramApiKey(settings.deepgramApiKey);

  if (!apiKey) {
    throw new Error('Deepgram API key not configured. Please add VITE_DEEPGRAM_API_KEY to environment variables or configure in settings.');
  }

  const fileSizeMB = file.size / (1024 * 1024);
  const VERCEL_SIZE_LIMIT_MB = 4; // Vercel has 4.5MB limit, use 4MB for safety
  const DEEPGRAM_DIRECT_LIMIT_MB = 2000; // Deepgram API supports up to 2GB for direct calls

  // 🎯 根据文件大小动态计算超时时间
  // 小文件（<10MB）：60秒
  // 中等文件（10-100MB）：120秒
  // 大文件（100-500MB）：600秒（10分钟）
  // 超大文件（>500MB）：1200秒（20分钟）
  // 注意：对于超大文件，上传时间可能很长，需要更长的超时时间
  const calculateTimeout = (sizeMB: number): number => {
    if (sizeMB < 10) return 60000;      // 60秒
    if (sizeMB < 100) return 120000;    // 120秒
    if (sizeMB < 500) return 600000;    // 600秒（10分钟）
    // 对于超大文件（>500MB），使用更长的超时时间
    // 估算：100MB/s上传速度，500MB需要5秒，但考虑到网络波动，使用20分钟
    return 1200000;                     // 1200秒（20分钟）
  };

  const requestTimeout = calculateTimeout(fileSizeMB);

  console.log('[Deepgram] Transcribing with Nova-2 model...', {
    fileSize: `${fileSizeMB.toFixed(2)}MB`,
    fileType: file.type,
    language,
    willNeedCompression: fileSizeMB > VERCEL_SIZE_LIMIT_MB,
    canUseDirectMode: fileSizeMB <= DEEPGRAM_DIRECT_LIMIT_MB,
    timeout: `${requestTimeout / 1000}s`
  });

  // 🎯 策略：
  // 1. 如果文件 <= 4MB：先尝试直接调用，失败则通过proxy
  // 2. 如果文件 4MB-2GB：尝试直接调用（绕过Vercel限制）
  // 3. 如果文件 > 2GB：必须压缩

  // 🎯 检查是否应该尝试直接调用
  // 注意：Deepgram API 的某些端点（如 /v1/projects）不支持CORS
  // 如果在验证阶段检测到CORS错误，这里也会遇到相同问题
  const shouldTryDirectFirst = fileSizeMB <= DEEPGRAM_DIRECT_LIMIT_MB;

  // 🎯 新策略：所有大文件都先提取音频，避免 CORS 问题
  // 原因：
  // 1. Deepgram /v1/listen 端点可能不支持 CORS（需要在浏览器中测试）
  // 2. 直接发送视频文件会浪费带宽（视频比音频大 10-20 倍）
  // 3. 提取音频后，大部分文件可以通过 Vercel proxy 处理（< 4MB）
  // 4. 只有极少数情况需要 Storage URL 模式
  console.log(`[Deepgram] 📝 Strategy: Extract audio first to avoid CORS and reduce file size`);

  // 标记：对于大文件，始终先提取音频
  let directCallFailed = fileSizeMB > VERCEL_SIZE_LIMIT_MB;

  // For large files that need compression or if direct call failed
  if (fileSizeMB > VERCEL_SIZE_LIMIT_MB || directCallFailed) {
    if (fileSizeMB > 100) {
      console.log(`[Deepgram] 🔥 Very large file (${fileSizeMB.toFixed(2)}MB), skipping direct call`);
      console.log('[Deepgram] 🎯 Will compress first for optimal performance...');
    } else if (directCallFailed) {
      console.log(`[Deepgram] ⚠️ Direct call failed or timed out, trying compression approach...`);
    } else {
      console.log(`[Deepgram] File too large for proxy (${fileSizeMB.toFixed(2)}MB > ${VERCEL_SIZE_LIMIT_MB}MB)`);
      console.log('[Deepgram] Compressing audio to reduce size...');
    }

    try {
      // Import audio extraction service
      const { extractAndCompressAudio, isAudioExtractionSupported } = await import('./audioExtractionService');

      // Check if audio extraction is supported
      if (!isAudioExtractionSupported()) {
        throw new Error('Audio extraction not supported in this browser. Please use Chrome, Edge, or Firefox.');
      }

      onProgress?.(5);

      // 🎯 智能压缩策略：根据文件大小选择合适的比特率
      // ⚠️ 重要：提高压缩质量以确保识别准确性（8kbps太低会导致识别错误）
      // 对于大文件，优先保证质量，如果压缩后仍然太大，会尝试直接调用或Storage
      let targetBitrate = 16000; // 默认 16 kbps（平衡质量，~1MB/分钟）
      let maxDuration: number | undefined = undefined;

      // 🎯 新策略：根据文件大小选择合适的压缩质量
      // 目标：确保音频文件不超过 50-80MB，即使是长视频
      if (fileSizeMB > 500) {
        // 超大文件（>500MB）：使用 12kbps（激进压缩），处理完整视频
        targetBitrate = 12000;
        console.log('[Deepgram] 🔧 Using aggressive compression: 12kbps, processing full video');
      } else if (fileSizeMB > 300) {
        // 大文件（>300MB）：使用 12kbps
        targetBitrate = 12000;
        console.log('[Deepgram] 🔧 Using aggressive compression: 12kbps, processing full video');
      } else if (fileSizeMB > 200) {
        // 大文件（>200MB）：使用 14kbps
        targetBitrate = 14000;
        console.log('[Deepgram] 🔧 Using moderate compression: 14kbps, processing full video');
      } else if (fileSizeMB > 100) {
        // 中等文件（>100MB）：使用 16kbps
        targetBitrate = 16000;
        console.log('[Deepgram] 🔧 Using balanced compression: 16kbps, processing full video');
      } else {
        // 小文件（≤100MB）：使用 16kbps（平衡质量）
        // 之前使用 28kbps 导致长视频（如80分钟）生成 160MB 音频，导致失败
        // 16kbps (8kHz 16-bit) 对于语音识别已经足够
        targetBitrate = 16000;
        console.log('[Deepgram] 🔧 Using balanced quality: 16kbps, processing full video');
      }

      // Extract and compress audio
      const { audioBlob, originalSize, compressedSize, compressionRatio, duration } = await extractAndCompressAudio(
        file,
        {
          onProgress: (progress, stage) => {
            // Map extraction progress (0-100%) to 5-50% of total progress
            onProgress?.(5 + progress * 0.45);
            console.log(`[Deepgram] ${stage} (${progress.toFixed(0)}%)`);
          },
          targetBitrate,
          maxDurationSeconds: maxDuration,
        }
      );

      onProgress?.(50);

      const compressedSizeMB = compressedSize / (1024 * 1024);
      console.log('[Deepgram] Audio compressed successfully:', {
        originalSize: `${fileSizeMB.toFixed(2)}MB`,
        compressedSize: `${compressedSizeMB.toFixed(2)}MB`,
        compressionRatio: `${compressionRatio.toFixed(1)}x`,
        savedSpace: `${((1 - compressedSize / originalSize) * 100).toFixed(1)}%`,
        processedDuration: maxDuration ? `${(maxDuration / 60).toFixed(1)} minutes` : `${(duration / 60).toFixed(1)} minutes (full)`,
      });

      // 🎯 检查压缩是否有效：如果压缩后反而变大，使用原始文件
      if (compressedSizeMB > fileSizeMB) {
        console.warn(`[Deepgram] ⚠️ Compression actually increased file size (${compressedSizeMB.toFixed(2)}MB > ${fileSizeMB.toFixed(2)}MB)`);
        console.warn('[Deepgram] 💡 This usually happens when video is already highly compressed');
        console.warn('[Deepgram] 💡 Will use original file instead of compressed version');

        // 使用原始文件，但需要增加超时时间
        const largeFileTimeout = Math.max(requestTimeout, 600000); // 至少10分钟
        console.log(`[Deepgram] 🔧 Using original file with extended timeout: ${largeFileTimeout / 1000}s`);

        // 直接使用原始文件调用Deepgram API
        try {
          onProgress?.(50);

          const params = new URLSearchParams({
            model: 'nova-2',
            smart_format: 'true',
            punctuate: 'true',
            paragraphs: 'false',
            utterances: 'false',
          });

          const languageCode = normalizeLanguageCode(language);
          if (languageCode) {
            params.append('language', languageCode);
            console.log('[Deepgram] 🌐 Language specified:', { input: language, normalized: languageCode });
          } else {
            console.log('[Deepgram] 🌐 Language auto-detection enabled');
          }

          const contentType = file.type || 'video/mp4';
          const directUrl = `https://api.deepgram.com/v1/listen?${params.toString()}`;

          // 🎯 添加Content-Length头
          const headers: HeadersInit = {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': contentType,
            'Content-Length': file.size.toString(),
          };

          console.log('[Deepgram] 📤 Uploading original file directly to Deepgram (compression not effective)...');
          console.log(`[Deepgram] 📊 Original file: ${fileSizeMB.toFixed(2)}MB (within Deepgram's 2GB limit)`);

          const directResponse = await retryWithBackoff(
            () => fetchWithTimeout(
              directUrl,
              {
                method: 'POST',
                headers,
                body: file,
              },
              largeFileTimeout
            ),
            2,
            2000
          );

          onProgress?.(90);

          if (directResponse.ok) {
            const result: DeepgramResponse = await directResponse.json();
            onProgress?.(100);
            console.log('[Deepgram] ✅✅✅ SUCCESS! Direct API call with original file worked!');
            logDeepgramResponse(result, 'direct call (original file, compression ineffective)');
            return result;
          } else {
            const errorText = await directResponse.text();
            console.warn('[Deepgram] ⚠️ Direct API call with original file failed:', errorText);
            // 继续尝试Storage上传
          }
        } catch (originalError) {
          const errorMsg = originalError instanceof Error ? originalError.message : String(originalError);
          console.warn('[Deepgram] ⚠️ Direct API call with original file failed:', errorMsg);
          // 继续尝试Storage上传
        }
      }

      // Check if compressed audio is still too large for Vercel proxy
      if (compressedSizeMB > VERCEL_SIZE_LIMIT_MB) {
        console.warn(`[Deepgram] Compressed audio still too large for Vercel proxy (${compressedSizeMB.toFixed(2)}MB > ${VERCEL_SIZE_LIMIT_MB}MB)`);
        console.log('[Deepgram] 🚀 Will try direct API call first (bypassing Vercel)...');

        // 🎯 策略1：先尝试直接调用Deepgram API（绕过Vercel限制）
        // Deepgram API支持最大2GB，4.58MB完全没问题
        try {
          onProgress?.(50);

          const params = new URLSearchParams({
            model: 'nova-2',
            smart_format: 'true',
            punctuate: 'true',
            paragraphs: 'false',
            utterances: 'false',
          });

          // 🎯 语言参数处理：标准化语言代码
          const languageCode = normalizeLanguageCode(language);
          if (languageCode) {
            params.append('language', languageCode);
            console.log('[Deepgram] 🌐 Language specified:', { input: language, normalized: languageCode });
          } else {
            console.log('[Deepgram] 🌐 Language auto-detection enabled');
          }

          const directUrl = `https://api.deepgram.com/v1/listen?${params.toString()}`;

          console.log('[Deepgram] 📤 Uploading compressed audio directly to Deepgram (bypassing Vercel)...');
          console.log(`[Deepgram] 📊 Compressed audio: ${compressedSizeMB.toFixed(2)}MB (within Deepgram's 2GB limit)`);

          // 🎯 添加Content-Length头，帮助Deepgram正确读取请求
          const headers: HeadersInit = {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'audio/wav',
          };

          // 对于Blob，添加Content-Length头
          if (audioBlob instanceof Blob) {
            headers['Content-Length'] = audioBlob.size.toString();
          }

          console.log('[Deepgram] Request headers:', {
            'Content-Type': headers['Content-Type'],
            'Content-Length': headers['Content-Length'],
            'Authorization': 'Token ***' // 不记录完整key
          });

          // 🎯 对于超大文件，使用更长的超时时间
          // 217MB文件上传可能需要很长时间，使用20分钟超时
          const uploadTimeout = compressedSizeMB > 100
            ? Math.max(requestTimeout, 1200000) // 至少20分钟
            : requestTimeout;

          console.log(`[Deepgram] ⏱️ Using timeout: ${uploadTimeout / 1000}s for ${compressedSizeMB.toFixed(2)}MB file`);

          // 使用带超时的fetch，并添加重试机制
          const directResponse = await retryWithBackoff(
            () => fetchWithTimeout(
              directUrl,
              {
                method: 'POST',
                headers,
                body: audioBlob,
              },
              uploadTimeout
            ),
            2, // 最多重试2次（总共3次尝试）
            2000 // 基础延迟2秒
          );

          onProgress?.(90);

          if (directResponse.ok) {
            const result: DeepgramResponse = await directResponse.json();
            onProgress?.(100);

            console.log('[Deepgram] ✅✅✅ SUCCESS! Direct API call with compressed audio worked!');
            console.log('[Deepgram] 🎉 No Vercel proxy, no Storage, no login required!');
            logDeepgramResponse(result, 'direct call (compressed audio)');
            return result;
          } else {
            const errorText = await directResponse.text();
            throw new Error(`Deepgram API error (${directResponse.status}): ${errorText || directResponse.statusText}`);
          }
        } catch (directError) {
          const directErrorMessage = directError instanceof Error ? directError.message : String(directError);
          console.warn('[Deepgram] ⚠️ Direct API call failed (will try Storage as fallback):', directErrorMessage);
          console.log('[Deepgram] ℹ️ This might be due to CORS or network issues. Trying Storage upload...');

          // 🎯 策略2：如果直接调用失败，尝试上传到Storage
          try {
            const { uploadFileToStorageWithProgress } = await import('../utils/uploadToStorage');

            // Convert Blob to File
            const fileToUpload = new File([audioBlob], 'compressed-audio.wav', { type: 'audio/wav' });

            const uploadResult = await uploadFileToStorageWithProgress(fileToUpload, {
              onProgress: (uploadProgress) => {
                onProgress?.(50 + uploadProgress * 0.3);
              },
            });

            onProgress?.(80);
            console.log('[Deepgram] Audio uploaded, using URL mode:', uploadResult.fileUrl);

            // Use Deepgram URL mode
            const urlParams = new URLSearchParams({
              model: 'nova-2',
              smart_format: 'true',
              punctuate: 'true',
              paragraphs: 'false',
              utterances: 'false',
            });

            // 🎯 语言参数处理：标准化语言代码
            const urlLanguageCode = normalizeLanguageCode(language);
            if (urlLanguageCode) {
              urlParams.append('language', urlLanguageCode);
              console.log('[Deepgram] 🌐 Language specified:', { input: language, normalized: urlLanguageCode });
            } else {
              console.log('[Deepgram] 🌐 Language auto-detection enabled');
            }

            urlParams.append('url_mode', 'true');
            const proxyUrl = `/api/deepgram-proxy?${urlParams.toString()}`;

            // 使用带超时的fetch，并添加重试机制
            const response = await retryWithBackoff(
              () => fetchWithTimeout(
                proxyUrl,
                {
                  method: 'POST',
                  headers: {
                    'X-Deepgram-API-Key': apiKey,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ url: uploadResult.fileUrl }),
                },
                requestTimeout
              ),
              2, // 最多重试2次（总共3次尝试）
              2000 // 基础延迟2秒
            );

            onProgress?.(90);

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Deepgram API error (${response.status}): ${errorText || response.statusText}`);
            }

            const result: DeepgramResponse = await response.json();
            onProgress?.(100);

            logDeepgramResponse(result, 'URL mode (compressed audio)');
            return result;
          } catch (uploadError) {
            const uploadErrorMessage = uploadError instanceof Error ? uploadError.message : String(uploadError);
            console.error('[Deepgram] Storage upload failed:', uploadErrorMessage);

            // 📌 重要提示：提供更友好的错误信息
            const isSupabaseConfigError = uploadErrorMessage.includes('SUPABASE_SERVICE_ROLE_KEY')
              || uploadErrorMessage.includes('not configured')
              || uploadErrorMessage.includes('500')
              || uploadErrorMessage.includes('does not exist');

            if (isSupabaseConfigError) {
              throw new Error(
                `压缩后的音频仍然太大 (${compressedSizeMB.toFixed(2)}MB)\n\n` +
                `已尝试的方法：\n` +
                `1. ✅ 直接调用Deepgram API（失败：${directErrorMessage.includes('CORS') ? 'CORS限制' : '网络错误'}）\n` +
                `2. ❌ 上传到Storage（失败：Storage未配置）\n\n` +
                `当前情况：\n` +
                `• 原始文件：${fileSizeMB.toFixed(2)}MB\n` +
                `• 压缩后：${compressedSizeMB.toFixed(2)}MB（${maxDuration ? `前${maxDuration / 60}分钟` : '全部'}）\n` +
                `• 压缩比率：${compressionRatio.toFixed(1)}x\n` +
                `• Vercel限制：${VERCEL_SIZE_LIMIT_MB}MB（通过proxy时）\n` +
                `• Deepgram限制：2GB（直接调用时，但遇到CORS问题）\n\n` +
                `🔧 解决方案（3选1）：\n\n` +
                `【推荐】方案1：配置 Supabase Storage\n` +
                `  在 Vercel 环境变量中添加：\n` +
                `  • SUPABASE_SERVICE_ROLE_KEY=你的密钥\n` +
                `  详见：@docs/SUPABASE_STORAGE_QUICK_SETUP.md\n\n` +
                `方案2：使用更短的视频\n` +
                `  当前已处理${maxDuration ? `前${maxDuration / 60}分钟` : '全部内容'}，\n` +
                `  可以尝试剪辑为5-8分钟的片段\n\n` +
                `方案3：检查网络/CORS设置\n` +
                `  如果直接调用失败，可能是CORS问题，\n` +
                `  需要配置Storage作为备选方案\n\n` +
                `Compressed audio still too large (${compressedSizeMB.toFixed(2)}MB)\n\n` +
                `Attempted methods:\n` +
                `1. ✅ Direct Deepgram API call (failed: ${directErrorMessage.includes('CORS') ? 'CORS restriction' : 'network error'})\n` +
                `2. ❌ Storage upload (failed: Storage not configured)\n\n` +
                `Current status:\n` +
                `• Original file: ${fileSizeMB.toFixed(2)}MB\n` +
                `• Compressed: ${compressedSizeMB.toFixed(2)}MB (${maxDuration ? `first ${maxDuration / 60} min` : 'full'})\n` +
                `• Compression ratio: ${compressionRatio.toFixed(1)}x\n` +
                `• Vercel limit: ${VERCEL_SIZE_LIMIT_MB}MB (via proxy)\n` +
                `• Deepgram limit: 2GB (direct call, but CORS issue encountered)\n\n` +
                `🔧 Solutions (choose one):\n\n` +
                `[Recommended] Option 1: Configure Supabase Storage\n` +
                `  Add to Vercel environment variables:\n` +
                `  • SUPABASE_SERVICE_ROLE_KEY=your-key\n` +
                `  See: @docs/SUPABASE_STORAGE_QUICK_SETUP.md\n\n` +
                `Option 2: Use shorter videos\n` +
                `  Currently processed ${maxDuration ? `first ${maxDuration / 60} min` : 'full content'},\n` +
                `  try 5-8 minute segments\n\n` +
                `Option 3: Check network/CORS settings\n` +
                `  If direct call fails, it might be a CORS issue,\n` +
                `  Storage configuration is required as fallback\n`
              );
            }

            // 其他Storage错误
            throw new Error(
              `压缩后的音频仍然太大 (${compressedSizeMB.toFixed(2)}MB)\n\n` +
              `已尝试的方法：\n` +
              `1. ✅ 直接调用Deepgram API（失败：${directErrorMessage.includes('CORS') ? 'CORS限制' : '网络错误'}）\n` +
              `2. ❌ 上传到Storage（失败：${uploadErrorMessage}）\n\n` +
              `建议解决方案：\n` +
              `1. 配置 Supabase Storage（设置 SUPABASE_SERVICE_ROLE_KEY）\n` +
              `2. 使用时长更短的视频片段（5-8分钟）\n` +
              `3. 检查网络连接和CORS设置\n\n` +
              `Compressed audio still too large (${compressedSizeMB.toFixed(2)}MB)\n\n` +
              `Attempted methods:\n` +
              `1. ✅ Direct Deepgram API call (failed: ${directErrorMessage.includes('CORS') ? 'CORS restriction' : 'network error'})\n` +
              `2. ❌ Storage upload (failed: ${uploadErrorMessage})\n\n` +
              `Suggested solutions:\n` +
              `1. Configure Supabase Storage (set SUPABASE_SERVICE_ROLE_KEY)\n` +
              `2. Use a shorter video segment (5-8 minutes)\n` +
              `3. Check network connection and CORS settings`
            );
          }
        }
      }

      // Use compressed audio
      console.log('[Deepgram] ✅ Compression successful! Using compressed audio for transcription');
      file = audioBlob;

      // 🎯 压缩后的音频优先尝试直接调用（绕过Vercel和Storage）
      const compressedFileSizeMB = file.size / (1024 * 1024);
      console.log(`[Deepgram] 📊 Compressed audio size: ${compressedFileSizeMB.toFixed(2)}MB`);

      if (compressedFileSizeMB <= DEEPGRAM_DIRECT_LIMIT_MB) {
        console.log(`[Deepgram] 🚀 Compressed audio (${compressedFileSizeMB.toFixed(2)}MB) is small enough for direct API call`);
        console.log('[Deepgram] 🎯 Attempting direct call (bypassing Vercel & Storage)...');

        try {
          onProgress?.(55);

          const params = new URLSearchParams({
            model: 'nova-2',
            smart_format: 'true',
            punctuate: 'true',
            paragraphs: 'false',
            utterances: 'false',
          });

          // 🎯 语言参数处理：标准化语言代码
          const languageCode = normalizeLanguageCode(language);
          if (languageCode) {
            params.append('language', languageCode);
            console.log('[Deepgram] 🌐 Language specified:', { input: language, normalized: languageCode });
          } else {
            console.log('[Deepgram] 🌐 Language auto-detection enabled');
          }

          const contentType = 'audio/wav';
          const directUrl = `https://api.deepgram.com/v1/listen?${params.toString()}`;

          console.log('[Deepgram] 📤 Uploading compressed audio directly to Deepgram...');

          // 🎯 添加Content-Length头，帮助Deepgram正确读取请求
          const headers: HeadersInit = {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': contentType,
          };

          // 对于File/Blob，添加Content-Length头
          if (file instanceof File || file instanceof Blob) {
            headers['Content-Length'] = file.size.toString();
          }

          console.log('[Deepgram] Request headers:', {
            'Content-Type': headers['Content-Type'],
            'Content-Length': headers['Content-Length'],
            'Authorization': 'Token ***'
          });

          // 使用带超时的fetch，并添加重试机制
          const directResponse = await retryWithBackoff(
            () => fetchWithTimeout(
              directUrl,
              {
                method: 'POST',
                headers,
                body: file,
              },
              requestTimeout
            ),
            2, // 最多重试2次（总共3次尝试）
            2000 // 基础延迟2秒
          );

          onProgress?.(90);

          if (directResponse.ok) {
            const result: DeepgramResponse = await directResponse.json();
            onProgress?.(100);
            console.log('[Deepgram] ✅✅✅ SUCCESS! Direct API call with compressed audio worked!');
            console.log('[Deepgram] 🎉 No Vercel proxy, no Storage, no login required!');
            logDeepgramResponse(result, 'direct call (compressed audio, fallback)');
            return result;
          } else {
            const errorText = await directResponse.text();
            console.warn('[Deepgram] ⚠️ Direct API call with compressed audio failed:', errorText);
            console.log('[Deepgram] Will try proxy mode as fallback...');
          }
        } catch (compressedDirectError) {
          const errorMsg = compressedDirectError instanceof Error ? compressedDirectError.message : String(compressedDirectError);
          console.log('[Deepgram] ℹ️ Direct API call with compressed audio failed:', errorMsg);
          console.log('[Deepgram] Will try proxy mode as fallback...');
        }
      } else {
        console.log(`[Deepgram] ⚠️ Compressed audio (${compressedFileSizeMB.toFixed(2)}MB) still too large for direct call`);
        console.log('[Deepgram] Will try uploading to Storage or use proxy...');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Deepgram] Audio compression failed:', errorMessage);

      // If compression failed, throw descriptive error
      if (errorMessage.includes('not supported')) {
        throw new Error(
          '音频压缩不支持\n\n' +
          '您的浏览器不支持音频提取功能。\n\n' +
          '解决方案：\n' +
          '1. 使用 Chrome、Edge 或 Firefox 浏览器\n' +
          '2. 配置 Supabase Storage 以处理大文件\n' +
          '3. 使用更小的视频文件（< 4MB）\n\n' +
          'Audio compression not supported\n\n' +
          'Your browser does not support audio extraction.\n\n' +
          'Solutions:\n' +
          '1. Use Chrome, Edge, or Firefox browser\n' +
          '2. Configure Supabase Storage for large files\n' +
          '3. Use a smaller video file (< 4MB)'
        );
      }

      throw error;
    }
  }

  // 🎯 小文件（≤ 4MB）也提取音频，避免 CORS 和减少传输
  // 原因：
  // 1. 视频文件比音频大 10-20 倍
  // 2. Deepgram 只需要音频，不需要视频帧
  // 3. 通过 proxy 更安全（API Key 不暴露）
  // 4. 完全避免 CORS 问题

  console.log(`[Deepgram] 📝 Small file (${fileSizeMB.toFixed(2)}MB), will extract audio first`);
  console.log('[Deepgram] 💡 This avoids CORS and reduces transfer size');

  try {
    // Import audio extraction service
    const { extractAndCompressAudio, isAudioExtractionSupported } = await import('./audioExtractionService');

    // Check if audio extraction is supported
    if (!isAudioExtractionSupported()) {
      throw new Error('Audio extraction not supported in this browser. Please use Chrome, Edge, or Firefox.');
    }

    onProgress?.(10);

    // 🎯 小文件使用平衡压缩（16kbps）
    // 即使是小文件，如果时长很长（如高度压缩的视频），使用32kbps也可能导致音频过大
    const targetBitrate = 16000; // 16 kbps - 平衡质量

    console.log('[Deepgram] 🔧 Using balanced compression: 16kbps');

    // Extract and compress audio
    const { audioBlob, originalSize, compressedSize, compressionRatio, duration } = await extractAndCompressAudio(
      file,
      {
        onProgress: (progress, stage) => {
          // Map extraction progress (0-100%) to 10-50% of total progress
          onProgress?.(10 + progress * 0.4);
          console.log(`[Deepgram] ${stage} (${progress.toFixed(0)}%)`);
        },
        targetBitrate,
      }
    );

    onProgress?.(50);

    const compressedSizeMB = compressedSize / (1024 * 1024);
    console.log('[Deepgram] Audio extracted successfully:', {
      originalSize: `${fileSizeMB.toFixed(2)}MB`,
      audioSize: `${compressedSizeMB.toFixed(2)}MB`,
      compressionRatio: `${compressionRatio.toFixed(1)}x`,
      savedSpace: `${((1 - compressedSize / originalSize) * 100).toFixed(1)}%`,
      duration: `${(duration / 60).toFixed(1)} minutes`,
    });

    // 现在使用提取的音频通过 proxy 发送
    file = audioBlob;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[Deepgram] ⚠️ Audio extraction failed, will try sending original file:', errorMessage);
    // 如果提取失败，继续使用原始文件（降级方案）
  }

  // 🔄 通过 Vercel proxy 发送（音频文件或原始文件）
  onProgress?.(55);

  // Build API URL with parameters
  const params = new URLSearchParams({
    model: 'nova-2',
    smart_format: 'true',
    punctuate: 'true',
    paragraphs: 'false',
    utterances: 'false',
  });

  // 🎯 语言参数处理：标准化语言代码
  const languageCode = normalizeLanguageCode(language);
  if (languageCode) {
    params.append('language', languageCode);
    console.log('[Deepgram] 🌐 Language specified:', { input: language, normalized: languageCode });
  } else {
    console.log('[Deepgram] 🌐 Language auto-detection enabled');
  }

  // Determine content type
  const contentType = file.type || 'audio/wav';

  // Build proxy URL with query parameters
  const proxyUrl = `/api/deepgram-proxy?${params.toString()}`;

  console.log('[Deepgram] 📤 Sending through Vercel proxy:', {
    url: proxyUrl,
    fileSize: `${(file.size / (1024 * 1024)).toFixed(2)}MB`,
    contentType,
    hasAuth: !!apiKey,
    keySource: settings.deepgramApiKey ? 'user' : 'system'
  });

  // Check if aborted before making request
  if (abortSignal?.aborted) {
    throw new Error('Operation cancelled by user');
  }

  // Call Deepgram API through proxy
  const response = await retryWithBackoff(
    () => fetchWithTimeout(
      proxyUrl,
      {
        method: 'POST',
        headers: {
          'X-Deepgram-API-Key': apiKey,
          'Content-Type': contentType,
        },
        body: file,
      },
      requestTimeout
    ),
    2, // 最多重试2次（总共3次尝试）
    2000 // 基础延迟2秒
  );

  onProgress?.(90);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Deepgram] API error:', {
      status: response.status,
      statusText: response.statusText,
      errorBody: errorText,
      headers: Object.fromEntries(response.headers.entries())
    });
    throw new Error(`Deepgram API error (${response.status}): ${errorText || response.statusText}`);
  }

  const result: DeepgramResponse = await response.json();
  onProgress?.(100);

  // 🎯 记录Deepgram返回的详细信息，便于诊断问题
  console.log('[Deepgram] ✅ Success via Vercel proxy!');
  logDeepgramResponse(result, 'proxy mode (small file with audio extraction)');

  return result;
}

/**
 * Convert Deepgram response to segments
 * Groups words into ~5-second segments for better readability
 * Filters out duplicate and invalid content
 */
export function deepgramToSegments(response: DeepgramResponse): DeepgramSegment[] {
  if (!response.results.channels || response.results.channels.length === 0) {
    console.warn('[Deepgram] No channels in response');
    return [];
  }

  const words = response.results.channels[0].alternatives[0].words;
  if (!words || words.length === 0) {
    console.warn('[Deepgram] No words in response');
    // Fallback to transcript if available
    const transcript = response.results.channels[0]?.alternatives[0]?.transcript;
    if (transcript) {
      console.log('[Deepgram] Using transcript as fallback:', transcript.substring(0, 100));
      return [{
        start: 0,
        end: response.metadata.duration || 10,
        text: transcript.trim(),
      }];
    }
    return [];
  }

  console.log('[Deepgram] Processing words:', {
    totalWords: words.length,
    duration: response.metadata.duration,
    firstWord: words[0]?.word,
    lastWord: words[words.length - 1]?.word,
  });
  
  // 🔍 调试：检查前5个单词的详细信息
  console.log('[Deepgram] 🔍 前5个单词详细信息:');
  words.slice(0, 5).forEach((word, i) => {
    console.log(`  单词 ${i + 1}:`, {
      原始值: word.word,
      类型: typeof word.word,
      长度: word.word?.length,
      字符编码: word.word ? Array.from(word.word).map(c => c.charCodeAt(0)) : [],
      时间: `${word.start.toFixed(2)}s - ${word.end.toFixed(2)}s`
    });
  });

  const segments: DeepgramSegment[] = [];
  const MAX_SEGMENT_DURATION = 5.0; // 5 seconds per segment
  const MAX_WORDS_PER_SEGMENT = 15; // Max words per segment

  // 🎯 更严格的过滤：过滤无效、重复和错误识别的单词
  const validWords = words.filter((word, index) => {
    if (!word.word || word.word.trim().length === 0) {
      return false;
    }

    const wordText = word.word.trim();

    // 过滤单个字符的单词（可能是识别错误）
    // ⚠️ 注意：不要过滤中文单字，中文大多数单词都是单个字符
    // 只过滤那些既不是中文、又不是英文/数字的单个字符
    if (wordText.length === 1) {
      // 允许中文字符（Unicode 范围：\u4e00-\u9fa5）
      const isChinese = /[\u4e00-\u9fa5]/.test(wordText);
      // 允许英文字母和数字
      const isAlphanumeric = /[a-zA-Z0-9]/.test(wordText);
      // 只有既不是中文、又不是英文/数字的单个字符才过滤
      if (!isChinese && !isAlphanumeric) {
        return false;
      }
    }

    // 过滤连续重复的单词（可能是识别错误）
    if (index > 0) {
      const prevWord = words[index - 1].word.trim();
      if (wordText === prevWord && Math.abs(word.start - words[index - 1].start) < 0.5) {
        return false;
      }
    }

    // 过滤3次以上连续重复的模式（如"的人的人的人"）
    if (index >= 2) {
      const prev1 = words[index - 1].word.trim();
      const prev2 = words[index - 2].word.trim();
      if (wordText === prev1 && prev1 === prev2) {
        return false;
      }
    }

    return true;
  });

  if (validWords.length === 0) {
    console.warn('[Deepgram] No valid words after filtering');
    return [];
  }

  console.log('[Deepgram] Valid words after filtering:', {
    original: words.length,
    valid: validWords.length,
    filtered: words.length - validWords.length,
  });

  let currentSegment: DeepgramSegment = {
    start: validWords[0].start,
    end: validWords[0].end,
    text: validWords[0].word,
  };

  for (let i = 1; i < validWords.length; i++) {
    const word = validWords[i];
    const segmentDuration = word.end - currentSegment.start;
    const wordCount = currentSegment.text.split(/\s+/).length;

    // Start new segment if duration or word count exceeds limit
    if (segmentDuration > MAX_SEGMENT_DURATION || wordCount >= MAX_WORDS_PER_SEGMENT) {
      // Only add segment if it has meaningful content
      const trimmedText = currentSegment.text.trim();
      // 🎯 更严格的过滤：检查重复模式和无效内容
      if (trimmedText.length > 0 &&
        trimmedText.length < 200 &&
        !isRepetitiveText(trimmedText)) { // 过滤重复文本
        segments.push(currentSegment);
      }
      currentSegment = {
        start: word.start,
        end: word.end,
        text: word.word,
      };
    } else {
      // Add word to current segment
      currentSegment.text += ' ' + word.word;
      currentSegment.end = word.end;
    }
  }

  // Add last segment
  const trimmedText = currentSegment.text.trim();
  if (trimmedText.length > 0 &&
    trimmedText.length < 200 &&
    !isRepetitiveText(trimmedText)) {
    segments.push(currentSegment);
  }

  console.log('[Deepgram] Generated segments:', {
    count: segments.length,
    totalDuration: segments.length > 0 ? segments[segments.length - 1].end : 0,
    averageDuration: segments.length > 0 ? segments.reduce((sum, s) => sum + (s.end - s.start), 0) / segments.length : 0,
  });
  
  // 🔍 调试：检查前3个生成的片段
  if (segments.length > 0) {
    console.log('[Deepgram] 🔍 前3个生成的片段:');
    segments.slice(0, 3).forEach((seg, i) => {
      console.log(`  片段 ${i + 1}:`, {
        文本: seg.text,
        文本长度: seg.text.length,
        字符编码: Array.from(seg.text.substring(0, 20)).map(c => c.charCodeAt(0)),
        时间: `${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s`
      });
    });
  }

  return segments;
}

/**
 * Convert Deepgram response to SRT format
 */
export function deepgramToSrt(response: DeepgramResponse): string {
  const segments = deepgramToSegments(response);

  if (segments.length === 0) {
    const transcript = response.results.channels[0]?.alternatives[0]?.transcript || '';
    return `1\n00:00:00,000 --> 00:00:10,000\n${transcript}\n`;
  }

  return segments.map((segment, index) => {
    const startTime = formatTimestamp(segment.start);
    const endTime = formatTimestamp(segment.end);
    const text = segment.text.trim();

    return `${index + 1}\n${startTime} --> ${endTime}\n${text}\n`;
  }).join('\n');
}

/**
 * Format seconds to SRT timestamp (HH:MM:SS,mmm)
 */
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}
