/**
 * Enhanced YouTube transcript fetcher
 * Based on https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-youtube-transcript
 */

import { SubtitleSegment } from '../types';

interface InnerTubeClient {
  id: string;
  clientName: string;
  clientHeaderName: string;
  clientVersion?: string;
  userAgent: string;
  extraContext?: Record<string, any>;
}

interface TranscriptInfo {
  language: string;
  languageCode: string;
  isGenerated: boolean;
  baseUrl: string;
}

const WATCH_URL = 'https://www.youtube.com/watch?v=';
const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player';
const WATCH_PAGE_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
const DEFAULT_WEB_CLIENT_VERSION = '2.20260320.08.00';

const INNER_TUBE_CLIENTS: InnerTubeClient[] = [
  {
    id: 'android',
    clientName: 'ANDROID',
    clientHeaderName: '3',
    clientVersion: '20.10.38',
    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14; en_US; Pixel 8 Pro; Build/AP1A.240405.002)',
    extraContext: {
      clientFormFactor: 'SMALL_FORM_FACTOR',
      androidSdkVersion: 34,
      osName: 'Android',
      osVersion: '14',
      platform: 'MOBILE',
    },
  },
  {
    id: 'web',
    clientName: 'WEB',
    clientHeaderName: '1',
    userAgent: WATCH_PAGE_USER_AGENT,
  },
  {
    id: 'ios',
    clientName: 'IOS',
    clientHeaderName: '5',
    clientVersion: '20.10.4',
    userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3 like Mac OS X; en_US)',
    extraContext: {
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      osName: 'iPhone',
      osVersion: '18.3.0.22D5054f',
      platform: 'MOBILE',
    },
  },
];

export function extractVideoId(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.hostname.includes('youtu.be')) {
      return url.pathname.split('/').filter(Boolean)[0] || null;
    }
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/').filter(Boolean)[1] || null;
      }
      return url.searchParams.get('v');
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchHtml(videoId: string): Promise<string> {
  const watchUrl = `${WATCH_URL}${videoId}&hl=en&persist_hl=1&has_verified=1&bpctr=9999999999`;
  const headers = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': WATCH_PAGE_USER_AGENT,
  };
  const response = await fetch(watchUrl, { headers });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  let html = await response.text();

  if (html.includes('action="https://consent.youtube.com/s"')) {
    const consentValue = html.match(/name="v" value="(.*?)"/);
    if (!consentValue) throw new Error('Failed to create consent cookie');
    const consentResponse = await fetch(watchUrl, {
      headers: { ...headers, Cookie: `CONSENT=YES+${consentValue[1]}` },
    });
    if (!consentResponse.ok) throw new Error(`HTTP ${consentResponse.status}`);
    html = await consentResponse.text();
  }

  return html;
}

function extractSession(html: string, videoId: string) {
  const apiKey = html.match(/"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/)?.[1];
  if (!apiKey) {
    if (html.includes('class="g-recaptcha"')) throw new Error('IP blocked (reCAPTCHA)');
    throw new Error('Cannot extract API key');
  }
  const webClientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":\s*"([^"]+)"/)?.[1] || DEFAULT_WEB_CLIENT_VERSION;
  const visitorData = html.match(/"VISITOR_DATA":"([^"]+)"/)?.[1] || '';
  return { apiKey, webClientVersion, visitorData };
}

async function fetchInnertubeData(videoId: string, session: any, client: InnerTubeClient): Promise<any> {
  const clientVersion = client.clientVersion || session.webClientVersion;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: 'https://www.youtube.com',
    Referer: `${WATCH_URL}${videoId}`,
    'User-Agent': client.userAgent,
    'X-YouTube-Client-Name': client.clientHeaderName,
    'X-YouTube-Client-Version': clientVersion,
  };
  if (session.visitorData) headers['X-Goog-Visitor-Id'] = session.visitorData;

  const response = await fetch(`${INNERTUBE_URL}?key=${session.apiKey}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      context: {
        client: {
          hl: 'en',
          gl: 'US',
          clientName: client.clientName,
          clientVersion,
          visitorData: session.visitorData,
          ...client.extraContext,
        },
      },
      videoId,
    }),
  });

  if (response.status === 429) throw new Error('IP blocked (429)');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function assertPlayability(data: any) {
  const status = data?.playabilityStatus?.status;
  if (status === 'OK' || !status) return;

  const reason = data.playabilityStatus.reason || '';
  if (status === 'ERROR' && reason.toLowerCase().includes('unavailable')) {
    throw new Error('Video unavailable');
  }
  if (status === 'LOGIN_REQUIRED') {
    if (reason.toLowerCase().includes('bot')) throw new Error('Bot detected');
    if (reason.toLowerCase().includes('inappropriate')) throw new Error('Age restricted');
  }
  throw new Error(`Video unplayable: ${reason}`);
}

function extractCaptionsJson(data: any): any {
  assertPlayability(data);
  const captions = data?.captions?.playerCaptionsTracklistRenderer;
  if (!captions?.captionTracks) throw new Error('No captions available');
  return captions;
}

function buildTranscriptList(captionsJson: any): TranscriptInfo[] {
  return (captionsJson.captionTracks || []).map((track: any) => ({
    language: track.name?.runs?.[0]?.text || track.name?.simpleText || '',
    languageCode: track.languageCode,
    isGenerated: track.kind === 'asr',
    baseUrl: track.baseUrl || '',
  }));
}

function parseTranscriptPayload(text: string): SubtitleSegment[] {
  try {
    const data = JSON.parse(text);
    const events = Array.isArray(data?.events) ? data.events : [];
    return events
      .filter((event: any) => Array.isArray(event.segs) && Number.isFinite(event.tStartMs))
      .map((event: any) => {
        const text = event.segs.map((seg: any) => seg.utf8 || '').join('').replace(/\s+/g, ' ').trim();
        const startTime = event.tStartMs / 1000;
        const duration = Number.isFinite(event.dDurationMs) ? event.dDurationMs : 3000;
        return { startTime, endTime: startTime + duration / 1000, text };
      })
      .filter((s: any) => s.text.length > 0);
  } catch {
    const matches = [...text.matchAll(/<text[^>]*start="([^"]+)"[^>]*(?:dur="([^"]+)")?[^>]*>([\s\S]*?)<\/text>/g)];
    return matches
      .map((m) => {
        const startTime = Number(m[1]);
        const duration = Number(m[2] || '3');
        const text = m[3].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        return { startTime, endTime: startTime + duration, text };
      })
      .filter((s) => s.text.length > 0);
  }
}

export async function fetchYouTubeTranscript(
  videoId: string,
  preferredLanguages: string[] = ['en', 'zh']
): Promise<{ segments: SubtitleSegment[]; language: string; languageCode: string; videoDetails: any }> {
  const html = await fetchHtml(videoId);
  const session = extractSession(html, videoId);

  let lastError: Error | null = null;

  for (const client of INNER_TUBE_CLIENTS) {
    try {
      const data = await fetchInnertubeData(videoId, session, client);
      const captionsJson = extractCaptionsJson(data);
      const transcripts = buildTranscriptList(captionsJson);

      let selectedTranscript: TranscriptInfo | null = null;
      for (const lang of preferredLanguages) {
        selectedTranscript = transcripts.find((t) => t.languageCode.toLowerCase().startsWith(lang.toLowerCase())) || null;
        if (selectedTranscript) break;
      }

      if (!selectedTranscript) selectedTranscript = transcripts[0];
      if (!selectedTranscript) throw new Error('No transcript found');

      const response = await fetch(selectedTranscript.baseUrl + '&fmt=json3');
      if (!response.ok) throw new Error(`Failed to fetch transcript: ${response.status}`);

      const segments = parseTranscriptPayload(await response.text());

      return {
        segments,
        language: selectedTranscript.language,
        languageCode: selectedTranscript.languageCode,
        videoDetails: data.videoDetails || {},
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const shouldTryNext = lastError.message.includes('Bot detected') ||
                            lastError.message.includes('IP blocked') ||
                            lastError.message.includes('HTTP 4');
      if (!shouldTryNext) break;
    }
  }

  throw lastError || new Error('Failed to fetch transcript');
}
