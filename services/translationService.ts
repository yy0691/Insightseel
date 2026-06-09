import { getEffectiveSettings } from './dbService';
import { authService } from './authService';
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
  /** Max number of batches to process simultaneously. Default: 4. Set to 1 for sequential (old behaviour). */
  concurrency?: number;
}

/**
 * Run async tasks with a fixed concurrency cap.
 * Tasks are started as slots free up; order of completion is not guaranteed.
 */
async function runWithConcurrency(tasks: (() => Promise<void>)[], concurrency: number): Promise<void> {
  const queue = [...tasks];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const task = queue.shift();
      if (task) await task();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
}

export async function translateSubtitles(
  segments: SubtitleSegment[],
  targetLanguage: 'zh-CN' | 'zh-TW' | 'en',
  onProgress?: (progress: number, stage: string) => void,
  options: TranslationOptions = {}
): Promise<SubtitleSegment[]> {
  const { onBatchComplete, skipAlreadyTranslated = false, concurrency = 4 } = options;
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

  console.log(`[Translation] Starting translation to ${targetLangName} | concurrency=${concurrency} | skipAlreadyTranslated=${skipAlreadyTranslated}`);
  onProgress?.(0, `Translating to ${targetLangName}...`);

  // Shared mutable state — safe because JS is single-threaded (no true data races)
  const result: SubtitleSegment[] = [...segments];
  const totalBatches = Math.ceil(segments.length / BATCH_SIZE);
  let completedBatches = 0;

  // Build one task per batch; they run concurrently up to `concurrency` at a time
  const tasks: (() => Promise<void>)[] = [];

  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const startIndex = i;
    const batch = segments.slice(startIndex, startIndex + BATCH_SIZE);
    const batchIndex = Math.floor(startIndex / BATCH_SIZE);

    tasks.push(async () => {
      // Skip fully-translated batches when resuming
      if (skipAlreadyTranslated && batch.every(s => s.translatedText?.trim())) {
        completedBatches++;
        onProgress?.((completedBatches / totalBatches) * 100, `Skipped batch ${batchIndex + 1}/${totalBatches}`);
        console.log(`[Translation] Batch ${batchIndex + 1}/${totalBatches} skipped (already translated)`);
        return;
      }

      const translatedBatch = await translateBatchWithRetry(batch, targetLangName, settings.useProxy);

      for (let j = 0; j < translatedBatch.length; j++) {
        result[startIndex + j] = translatedBatch[j];
      }

      completedBatches++;
      const pct = Math.round((completedBatches / totalBatches) * 100);
      onProgress?.(pct, `Translated ${completedBatches}/${totalBatches} batches...`);
      console.log(`[Translation] Batch ${batchIndex + 1}/${totalBatches} complete (${pct}%)`);

      // Deliver incremental snapshot — completedBatches may not be in order, but positions are correct
      onBatchComplete?.([...result], completedBatches, totalBatches);
    });
  }

  await runWithConcurrency(tasks, concurrency);

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

// ── Translation internals ────────────────────────────────────────────────────

function buildTranslationPrompt(segments: SubtitleSegment[], targetLanguage: string): string {
  const lines = segments.map((seg, idx) => `${idx + 1}|${seg.text}`).join('\n');
  return `Translate the following subtitle lines into ${targetLanguage}.

STRICT OUTPUT FORMAT — NO EXCEPTIONS:
- Start output immediately with line 1. No preamble, no headers, no summary.
- Each line MUST be exactly: NUMBER|TRANSLATED_TEXT
- Use plain ASCII pipe | as separator (no spaces around it)
- No code fences (\`\`\`), no markdown, no bullet points, no blank lines between entries
- Output ONLY the translated lines — nothing else

TRANSLATION RULES:
- Write natural, idiomatic ${targetLanguage}. No word-for-word literal translation.
- Preserve proper nouns, brand names, product names, and technical acronyms exactly as-is.
- If a line is already in ${targetLanguage}, copy it unchanged.
- Match the speaker's tone (conversational, formal, or humorous).
- Keep subtitles concise and readable.

Lines to translate:
${lines}`;
}

/** Call the LLM (proxy or direct) and return raw text. */
async function callTranslationLLM(prompt: string, useProxy: boolean): Promise<string> {
  if (useProxy) {
    const settings = await getEffectiveSettings();
    const payload: any = {
      provider: settings.provider || 'gemini',
      contents: [{ parts: [{ text: prompt }] }],
    };
    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: await authService.getProxyHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      throw new Error(`Translation API error: ${errorData.error || response.status}`);
    }
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? data.content ?? '';
    if (!text) throw new Error('Translation API returned empty response');
    return text;
  }

  const settings = await getEffectiveSettings();
  const provider = settings.provider || 'gemini';
  const config = PROVIDER_CONFIGS[provider];
  const apiKey = settings.apiKey;
  if (!apiKey) throw new Error('API Key not configured');
  const baseUrl = settings.baseUrl || config.defaultBaseUrl;
  const model = settings.model || config.defaultModel;
  const adapter = createAPIAdapter(provider, apiKey, baseUrl, model, getProviderExtraHeaders(settings));
  const response = await adapter.generateContent({ prompt, temperature: 0.3, maxTokens: 8000 });
  return response.text;
}

/**
 * Parse LLM response into a Map<segmentIndex, translatedText>.
 * Handles code fences, fullwidth pipes, and leading list markers.
 */
function parseTranslationResponse(raw: string, segmentCount: number): Map<number, string> {
  // Strip any code fences the model may have wrapped the output in
  const cleaned = raw.replace(/```[^\n]*\n([\s\S]*?)```/g, '$1').trim();

  const map = new Map<number, string>();
  for (const line of cleaned.split('\n')) {
    const trimmed = line.trim().replace(/^[-*•]\s*/, '');
    if (!trimmed) continue;
    // Accept ASCII | and fullwidth ｜, with optional surrounding whitespace
    const match = trimmed.match(/^(\d+)\s*[|｜]\s*([\s\S]*)$/);
    if (!match) continue;
    const idx = parseInt(match[1], 10) - 1;
    const text = match[2].trim();
    if (idx >= 0 && idx < segmentCount && text) {
      map.set(idx, text);
    }
  }
  return map;
}

async function translateBatch(
  segments: SubtitleSegment[],
  targetLanguage: string,
  useProxy: boolean = false
): Promise<SubtitleSegment[]> {
  // First pass
  const raw = await callTranslationLLM(buildTranslationPrompt(segments, targetLanguage), useProxy);
  const map = parseTranslationResponse(raw, segments.length);

  const matchRate = segments.length > 0 ? map.size / segments.length : 1;
  if (matchRate < 0.5) {
    throw new Error(
      `Translation parse failed: matched ${map.size}/${segments.length} lines (${Math.round(matchRate * 100)}%). ` +
      `Response preview: ${raw.slice(0, 300)}`
    );
  }

  // Mop-up pass: retry any segments that weren't matched (up to half the batch)
  const missed = segments.map((_, i) => i).filter(i => !map.has(i));
  if (missed.length > 0 && missed.length <= Math.ceil(segments.length * 0.5)) {
    try {
      const missedSegs = missed.map(i => segments[i]);
      const raw2 = await callTranslationLLM(buildTranslationPrompt(missedSegs, targetLanguage), useProxy);
      const map2 = parseTranslationResponse(raw2, missedSegs.length);
      map2.forEach((text, localIdx) => map.set(missed[localIdx], text));
      console.log(`[Translation] Mop-up recovered ${map2.size}/${missed.length} missed segments`);
    } catch (e) {
      console.warn('[Translation] Mop-up pass failed (non-fatal):', e);
    }
  }

  return segments.map((seg, idx) => ({
    ...seg,
    translatedText: map.has(idx) ? map.get(idx)! : (seg.translatedText || seg.text),
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
