/**
 * Subtitle Polish Service - 字幕润色服务
 * 翻译 + 纠错 + 断句 + 专有名词保护
 */

import { SubtitleSegment } from '../types';
import { callLLM } from './llmService';

export type TargetLanguage = 'zh-CN' | 'zh-TW' | 'en';
export type SubtitleMode = 'translation-only' | 'bilingual';

export interface PolishOptions {
  sourceLanguage?: string;
  targetLanguage: TargetLanguage;
  preserveTechnicalTerms?: boolean;
  smartLineBreak?: boolean;
  bilingualMode?: SubtitleMode;
  maxWordsPerLine?: number;
  maxDurationPerSegment?: number;
}

export interface PolishedSegment extends SubtitleSegment {
  translation?: string;
  originalText?: string;
}

const TECHNICAL_TERMS = [
  'Claude', 'MCP', 'API', 'SDK', 'AI', 'ML', 'GPU', 'CPU',
  'TypeScript', 'JavaScript', 'React', 'Node.js', 'Python',
  'AWS', 'Azure', 'GCP', 'Vercel', 'Supabase',
  'GitHub', 'GitLab', 'Docker', 'Kubernetes'
];

/**
 * 润色字幕 - 翻译 + 纠错 + 断句
 */
export async function polishSubtitles(
  segments: SubtitleSegment[],
  options: PolishOptions
): Promise<PolishedSegment[]> {
  console.log('[Polish] Starting subtitle polishing...', {
    segments: segments.length,
    targetLanguage: options.targetLanguage,
    bilingualMode: options.bilingualMode
  });

  // 分批处理（每批 20 条字幕）
  const batchSize = 20;
  const polished: PolishedSegment[] = [];

  for (let i = 0; i < segments.length; i += batchSize) {
    const batch = segments.slice(i, i + batchSize);
    const batchResult = await polishBatch(batch, options);
    polished.push(...batchResult);

    console.log(`[Polish] Processed ${Math.min(i + batchSize, segments.length)}/${segments.length}`);
  }

  return polished;
}

async function polishBatch(
  segments: SubtitleSegment[],
  options: PolishOptions
): Promise<PolishedSegment[]> {
  const targetLangName = {
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文',
    'en': 'English'
  }[options.targetLanguage];

  const technicalTermsList = options.preserveTechnicalTerms
    ? `\n保持这些专有名词不译：${TECHNICAL_TERMS.join(', ')}`
    : '';

  const bilingualInstructions = options.bilingualMode === 'bilingual'
    ? '\n输出格式：每条字幕两行，第一行中文翻译，第二行英文原文'
    : '\n输出格式：只输出翻译后的文本';

  const prompt = `你是专业字幕翻译。任务：
1. 修正转写错误（常见错误：Claude→cloud, MCP→NCP, API→8P）
2. 翻译为${targetLangName}，表达自然流畅
3. ${options.smartLineBreak ? `按语义断句（每句≤${options.maxWordsPerLine || 15}词，≤${options.maxDurationPerSegment || 5}秒）` : '保持原有断句'}${technicalTermsList}${bilingualInstructions}

输入字幕（格式：序号|开始-结束|文本）：
${segments.map((s, i) => `${i + 1}|${s.startTime.toFixed(2)}-${s.endTime.toFixed(2)}|${s.text}`).join('\n')}

输出要求：
- 保持时间戳不变
- 译文简洁准确，避免机翻腔
- 技术术语保持原文
${options.bilingualMode === 'bilingual' ? '- 双语格式示例：\n1|0.00-3.50|这是中文翻译\n1|0.00-3.50|This is the original text' : ''}

请输出润色后的字幕：`;

  const response = await callLLM(prompt, { temperature: 0.3 });
  return parsePolishedResponse(response, segments, options.bilingualMode === 'bilingual');
}

function parsePolishedResponse(
  response: string,
  originalSegments: SubtitleSegment[],
  isBilingual: boolean
): PolishedSegment[] {
  const lines = response.split('\n').filter(line => line.trim());
  const polished: PolishedSegment[] = [];

  if (isBilingual) {
    // 双语模式：两行一组（中文 + 英文）
    for (let i = 0; i < lines.length; i += 2) {
      const chineseLine = lines[i];
      const englishLine = lines[i + 1];

      if (!chineseLine || !englishLine) continue;

      const chParts = chineseLine.split('|');
      const enParts = englishLine.split('|');

      if (chParts.length >= 3 && enParts.length >= 3) {
        const index = parseInt(chParts[0]) - 1;
        const [startStr, endStr] = chParts[1].split('-');
        const translation = chParts.slice(2).join('|').trim();
        const originalText = enParts.slice(2).join('|').trim();

        polished.push({
          startTime: parseFloat(startStr),
          endTime: parseFloat(endStr),
          text: originalText,
          translation,
          originalText
        });
      }
    }
  } else {
    // 翻译模式：一行一条
    lines.forEach(line => {
      const parts = line.split('|');
      if (parts.length >= 3) {
        const [startStr, endStr] = parts[1].split('-');
        const translation = parts.slice(2).join('|').trim();

        polished.push({
          startTime: parseFloat(startStr),
          endTime: parseFloat(endStr),
          text: translation,
          translation
        });
      }
    });
  }

  // 如果解析失败，返回原始字幕
  if (polished.length === 0) {
    console.warn('[Polish] Failed to parse LLM response, returning original segments');
    return originalSegments.map(s => ({ ...s }));
  }

  return polished;
}

/**
 * 简单的 LLM 调用封装
 */
async function callLLM(prompt: string, options: { temperature?: number } = {}): Promise<string> {
  const response = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature || 0.7,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    throw new Error(`LLM call failed: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || data.text || '';
}
