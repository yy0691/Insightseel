/**
 * Subtitle Format Utilities - SRT/ASS 格式转换
 */

import { SubtitleSegment } from '../types';

/**
 * 格式化 SRT 时间戳
 */
export function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * 生成 SRT 格式字幕
 */
export function generateSRT(
  segments: SubtitleSegment[],
  mode: 'single' | 'bilingual' = 'single'
): string {
  return segments.map((seg, i) => {
    const start = formatSRTTime(seg.startTime);
    const end = formatSRTTime(seg.endTime);

    let text: string;
    if (mode === 'bilingual' && 'translation' in seg && seg.translation) {
      // 双语：中文在上，英文在下
      text = `${seg.translation}\n${seg.text}`;
    } else if ('translation' in seg && seg.translation) {
      // 仅翻译
      text = seg.translation;
    } else {
      // 原文
      text = seg.text;
    }

    return `${i + 1}\n${start} --> ${end}\n${text}\n`;
  }).join('\n');
}

/**
 * 生成 ASS 格式字幕（双语专用）
 */
export function generateBilingualASS(
  segments: SubtitleSegment[],
  options: {
    chineseSize?: number;
    englishSize?: number;
    videoWidth?: number;
    videoHeight?: number;
    fontName?: string;
  } = {}
): string {
  const chineseSize = options.chineseSize || 24;
  const englishSize = options.englishSize || Math.round(chineseSize / 1.7);
  const fontName = options.fontName || 'Arial';
  const videoWidth = options.videoWidth || 1920;
  const videoHeight = options.videoHeight || 1080;

  // ASS 文件头
  const header = `[Script Info]
Title: Bilingual Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Chinese,${fontName},${chineseSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,20,1
Style: English,${fontName},${englishSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // 生成字幕事件
  const events = segments.map(seg => {
    const start = formatASSTime(seg.startTime);
    const end = formatASSTime(seg.endTime);

    const translation = 'translation' in seg && seg.translation ? seg.translation : seg.text;
    const original = seg.text;

    // 两行事件：中文 + 英文
    return [
      `Dialogue: 0,${start},${end},Chinese,,0,0,0,,${escapeASSText(translation)}`,
      `Dialogue: 0,${start},${end},English,,0,0,0,,${escapeASSText(original)}`
    ].join('\n');
  }).join('\n');

  return header + events;
}

/**
 * 格式化 ASS 时间戳
 */
function formatASSTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100); // 厘秒

  return `${String(hours).padStart(1, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * 转义 ASS 文本中的特殊字符
 */
function escapeASSText(text: string): string {
  return text.replace(/\n/g, '\\N');
}

/**
 * 解析 SRT 文件
 */
export function parseSRT(srtContent: string): SubtitleSegment[] {
  const blocks = srtContent.split(/\n\s*\n/).filter(b => b.trim());
  const segments: SubtitleSegment[] = [];

  blocks.forEach(block => {
    const lines = block.split('\n');
    if (lines.length < 3) return;

    const timeLine = lines[1];
    const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);

    if (timeMatch) {
      const startTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
      const endTime = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
      const text = lines.slice(2).join('\n');

      segments.push({ startTime, endTime, text });
    }
  });

  return segments;
}
