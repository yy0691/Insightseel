import { getEffectiveSettings } from './dbService';
import { SubtitleSegment } from '../types';
import { createAPIAdapter, APIRequest, PROVIDER_CONFIGS } from './apiProviders';

const BATCH_SIZE = 30;
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getProviderExtraHeaders(settings: Awaited<ReturnType<typeof getEffectiveSettings>>): Record<string, string> {
  const headers: Record<string, string> = {};
  const isXiaomiMimo = settings.provider === 'xiaomi_mimo';
  const httpReferer = settings.httpReferer || (isXiaomiMimo ? 'https://cherry-ai.com' : undefined);
  const xTitle = settings.xTitle || (isXiaomiMimo ? 'Cherry Studio' : undefined);

  if (httpReferer) {
    headers['HTTP-Referer'] = httpReferer;
  }
  if (xTitle) {
    headers['X-Title'] = xTitle;
  }

  return headers;
}

export interface TranslationOptions {
  /** Called after each batch completes with ALL segments translated so far (already-translated + newly-translated). */
  onBatchComplete?: (
    partialSegments: SubtitleSegment[],
    completedBatches: number,
    totalBatches: number
  ) => void;
  /** When true, batches whose every segment already has a non-empty `translatedText` are skipped. */
  skipAlreadyTranslated?: boolean;
}

export async function translateSubtitles(
  segments: SubtitleSegment[],
  targetLanguage: 'zh-CN' | 'zh-TW' | 'en',
  onProgress?: (progress: number, stage: string) => void,
  options: TranslationOptions = {}
): Promise<SubtitleSegment[]> {
  const { onBatchComplete, skipAlreadyTranslated = false } = options;
  const settings = await getEffectiveSettings();

  if (!settings.apiKey && !settings.useProxy) {
    throw new Error('API Key not configured');
  }

  const languageMap = {
    'zh-CN': 'Simplified Chinese (简体中文)',
    'zh-TW': 'Traditional Chinese (繁體中文)',
    'en': 'English'
  };

  const targetLangName = languageMap[targetLanguage];

  console.log(`[Translation] Starting translation to ${targetLangName}, skipAlreadyTranslated=${skipAlreadyTranslated}`);
  onProgress?.(0, `Translating to ${targetLangName}...`);

  // Start result array from input so pre-translated segments are already in place
  const result: SubtitleSegment[] = [...segments];
  const totalBatches = Math.ceil(segments.length / BATCH_SIZE);
  let completedBatches = 0;

  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE);
    const progress = (completedBatches / totalBatches) * 100;

    onProgress?.(progress, `Translating batch ${batchIndex + 1}/${totalBatches}...`);

    // Skip this batch if all segments already have translations
    if (skipAlreadyTranslated && batch.every(s => s.translatedText?.trim())) {
      console.log(`[Translation] Batch ${batchIndex + 1}/${totalBatches} skipped (already translated)`);
      completedBatches++;
      onProgress?.((completedBatches / totalBatches) * 100, `Skipped batch ${batchIndex + 1}/${totalBatches}`);
      continue;
    }

    const translatedBatch = await translateBatchWithRetry(batch, targetLangName, settings.useProxy);

    // Write translated segments back into the result array at the correct indices
    for (let j = 0; j < translatedBatch.length; j++) {
      result[i + j] = translatedBatch[j];
    }

    completedBatches++;
    console.log(`[Translation] Batch ${batchIndex + 1}/${totalBatches} complete`);

    // Notify caller with a snapshot of all segments completed so far
    onBatchComplete?.([...result], completedBatches, totalBatches);
  }

  onProgress?.(100, 'Translation complete!');
  console.log('[Translation] All translations complete');

  return result;
}

async function translateBatchWithRetry(
  segments: SubtitleSegment[],
  targetLanguage: string,
  useProxy: boolean = false
): Promise<SubtitleSegment[]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await translateBatch(segments, targetLanguage, useProxy);
    } catch (error) {
      lastError = error;
      console.warn(`[Translation] Batch attempt ${attempt}/${MAX_RETRIES} failed:`, error);
      if (attempt < MAX_RETRIES) {
        await sleep(800 * attempt);
      }
    }
  }

  console.error('[Translation] Batch failed after retries, preserving original text:', lastError);
  return segments.map((seg) => ({
    ...seg,
    translatedText: seg.translatedText || seg.text,
  }));
}

async function translateBatch(
  segments: SubtitleSegment[],
  targetLanguage: string,
  useProxy: boolean = false
): Promise<SubtitleSegment[]> {
  const textToTranslate = segments.map((seg, idx) =>
    `${idx + 1}|${seg.text}`
  ).join('\n');

  const prompt = `Translate the following subtitle lines to ${targetLanguage}.

IMPORTANT RULES:
1. Keep the exact same format: "number|translated text"
2. Translate ONLY the text after the "|" character
3. Keep all line numbers unchanged
4. Preserve all punctuation and formatting in translation
5. If text is already in target language, keep it as is
6. Output ONLY the translated lines, no explanations

Example format:
1|Hello world
2|How are you?

Should output:
1|你好世界
2|你好吗？

Input to translate:
${textToTranslate}`;

  let translatedText: string;

  if (useProxy) {
    const settings = await getEffectiveSettings();
    const payload: any = {
      provider: settings.provider || 'gemini',
      contents: [{ parts: [{ text: prompt }] }]
    };

    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      throw new Error(`Translation API error: ${errorData.error || response.status}`);
    }

    const data = await response.json();
    // Extract text from Gemini response format
    translatedText = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? data.content ?? '';
    
    if (!translatedText) {
      throw new Error('Translation API returned empty response');
    }
  } else {
    const settings = await getEffectiveSettings();
    const provider = settings.provider || 'gemini';
    const config = PROVIDER_CONFIGS[provider];
    const apiKey = settings.apiKey;

    if (!apiKey) {
      throw new Error('API Key not configured');
    }

    const baseUrl = settings.baseUrl || config.defaultBaseUrl;
    const model = settings.model || config.defaultModel;
    const adapter = createAPIAdapter(provider, apiKey, baseUrl, model, getProviderExtraHeaders(settings));

    const request: APIRequest = {
      prompt,
      temperature: 0.3,
      maxTokens: 8000
    };

    const response = await adapter.generateContent(request);
    translatedText = response.text;
  }

  const translatedLines = translatedText.trim().split('\n');
  const translatedMap = new Map<number, string>();

  for (const line of translatedLines) {
    const cleanedLine = line.trim().replace(/^[-*]\s*/, '');
    const match = cleanedLine.match(/^(\d+)\|(.*)$/);
    if (match) {
      const index = parseInt(match[1]) - 1;
      const text = match[2].trim();
      translatedMap.set(index, text);
    }
  }

  const matchedRatio = segments.length > 0 ? translatedMap.size / segments.length : 1;
  if (matchedRatio < 0.7) {
    throw new Error(`Translation response format invalid: only ${translatedMap.size}/${segments.length} lines matched`);
  }

  return segments.map((seg, idx) => ({
    ...seg,
    translatedText: translatedMap.get(idx) || seg.text
  }));
}

export function detectSubtitleLanguage(segments: SubtitleSegment[]): 'zh' | 'en' | 'unknown' {
  if (segments.length === 0) return 'unknown';

  const sampleText = segments.slice(0, 10).map(s => s.text).join(' ');

  const chineseChars = (sampleText.match(/[\u4e00-\u9fff]/g) || []).length;
  const totalChars = sampleText.length;

  if (chineseChars / totalChars > 0.3) {
    return 'zh';
  }

  const englishWords = (sampleText.match(/[a-zA-Z]+/g) || []).length;
  if (englishWords > 5) {
    return 'en';
  }

  return 'unknown';
}

export function isTraditionalChinese(segments: SubtitleSegment[]): boolean {
  if (segments.length === 0) return false;

  const sampleText = segments.slice(0, 10).map(s => s.text).join('');

  const traditionalChars = ['繁', '體', '臺', '灣', '們', '個', '為', '來', '經', '過'];
  const simplifiedChars = ['繁', '体', '台', '湾', '们', '个', '为', '来', '经', '过'];

  let traditionalCount = 0;
  let simplifiedCount = 0;

  for (let i = 0; i < traditionalChars.length; i++) {
    if (sampleText.includes(traditionalChars[i])) traditionalCount++;
    if (sampleText.includes(simplifiedChars[i])) simplifiedCount++;
  }

  return traditionalCount > simplifiedCount;
}
