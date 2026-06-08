type CaptionTrack = {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
  name?: { simpleText?: string; runs?: Array<{ text: string }> };
};

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

export function getTrackName(track: CaptionTrack): string {
  if (track.name?.simpleText) {
    return track.name.simpleText;
  }
  if (track.name?.runs?.length) {
    return track.name.runs.map((run) => run.text).join('');
  }
  return track.languageCode || 'Subtitle';
}

export function extractBalancedJson(html: string, marker: string): any | null {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const start = html.indexOf('{', markerIndex);
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i++) {
    const char = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return JSON.parse(html.slice(start, i + 1));
      }
    }
  }

  return null;
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function parseJson3Captions(data: any) {
  const events = Array.isArray(data?.events) ? data.events : [];
  return events
    .filter((event: any) => Array.isArray(event.segs) && Number.isFinite(event.tStartMs))
    .map((event: any) => {
      const text = event.segs
        .map((seg: any) => seg.utf8 || '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      const startTime = event.tStartMs / 1000;
      const durationMs = Number.isFinite(event.dDurationMs) ? event.dDurationMs : 3000;
      return {
        startTime,
        endTime: startTime + durationMs / 1000,
        text,
      };
    })
    .filter((segment: any) => segment.text.length > 0);
}

export function parseXmlCaptions(xml: string) {
  const matches = [...xml.matchAll(/<text[^>]*start="([^"]+)"[^>]*(?:dur="([^"]+)")?[^>]*>([\s\S]*?)<\/text>/g)];
  return matches
    .map((match) => {
      const startTime = Number(match[1]);
      const duration = Number(match[2] || '3');
      const text = decodeEntities(match[3].replace(/<[^>]+>/g, ''))
        .replace(/\s+/g, ' ')
        .trim();
      return {
        startTime,
        endTime: startTime + duration,
        text,
      };
    })
    .filter((segment) => Number.isFinite(segment.startTime) && segment.text.length > 0);
}

export function withFormat(url: string, format: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set('fmt', format);
  return parsed.toString();
}

// ─── InnerTube client configs ────────────────────────────────────────────────
// YouTube's internal API used by official clients; returns structured JSON
// without requiring an API key or authentication for public videos.
const INNERTUBE_CLIENTS = [
  {
    // Android client – most reliable for captions
    clientName: 'ANDROID',
    clientVersion: '17.31.35',
    xClientName: '3',
    userAgent: 'com.google.android.youtube/17.31.35 (Linux; U; Android 11) gzip',
    extra: { androidSdkVersion: 30 },
  },
  {
    // TV HTML5 – bypasses age/consent gates
    clientName: 'TVHTML5',
    clientVersion: '7.20230405.08.01',
    xClientName: '7',
    userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 Chrome/56.0.2924.0 TV Safari/537.36',
    extra: {},
  },
  {
    // Web client as final fallback
    clientName: 'WEB',
    clientVersion: '2.20240101.00.00',
    xClientName: '1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    extra: {},
  },
];

async function fetchPlayerViaInnertube(
  videoId: string,
): Promise<{ tracks: CaptionTrack[]; videoDetails: Record<string, any> } | null> {
  for (const client of INNERTUBE_CLIENTS) {
    try {
      const resp = await fetch('https://www.youtube.com/youtubei/v1/player', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': client.userAgent,
          'X-Youtube-Client-Name': client.xClientName,
          'X-Youtube-Client-Version': client.clientVersion,
          'Origin': 'https://www.youtube.com',
          'Referer': `https://www.youtube.com/watch?v=${videoId}`,
        },
        body: JSON.stringify({
          videoId,
          context: {
            client: {
              clientName: client.clientName,
              clientVersion: client.clientVersion,
              hl: 'en',
              gl: 'US',
              ...client.extra,
            },
          },
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      });

      if (!resp.ok) continue;

      const data = await resp.json();
      const tracks: CaptionTrack[] =
        data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      const videoDetails = data?.videoDetails ?? {};

      // Accept if we got video details even with no tracks (means video exists)
      if (videoDetails.videoId || tracks.length > 0) {
        return { tracks, videoDetails };
      }
    } catch {
      continue;
    }
  }
  return null;
}

// ─── HTML scraping fallback ───────────────────────────────────────────────────
// Used only when InnerTube returns nothing; needs CONSENT cookie + better UA
async function fetchPlayerViaHtml(
  videoId: string,
): Promise<{ tracks: CaptionTrack[]; videoDetails: Record<string, any> } | null> {
  try {
    const resp = await fetch(
      `https://www.youtube.com/watch?v=${videoId}&hl=en&gl=US`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          // Bypass GDPR/consent gate
          'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+999; SOCS=CAE=',
        },
      },
    );

    if (!resp.ok) return null;

    const html = await resp.text();
    const playerResponse = extractBalancedJson(html, 'ytInitialPlayerResponse');
    if (!playerResponse) return null;

    const tracks: CaptionTrack[] =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    return { tracks, videoDetails: playerResponse?.videoDetails ?? {} };
  } catch {
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { url, preferredLanguage } = body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing YouTube URL' });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // 1. Try InnerTube (reliable structured API)
    let playerData = await fetchPlayerViaInnertube(videoId);

    // 2. Fall back to HTML scraping if InnerTube returned nothing
    if (!playerData) {
      playerData = await fetchPlayerViaHtml(videoId);
    }

    if (!playerData) {
      return res.status(502).json({ error: 'Could not retrieve video data from YouTube. The video may be unavailable or region-restricted.' });
    }

    const { tracks: captionTracks, videoDetails } = playerData;

    if (!captionTracks.length) {
      return res.status(404).json({
        error: 'No captions found for this video. The video may not have subtitles, or they may be disabled by the creator.',
      });
    }

    // Select preferred track
    const preferred = typeof preferredLanguage === 'string' ? preferredLanguage.toLowerCase() : '';
    const selectedTrack =
      captionTracks.find((t) => preferred && t.languageCode?.toLowerCase().startsWith(preferred)) ||
      captionTracks.find((t) => t.languageCode?.toLowerCase().startsWith('zh')) ||
      captionTracks.find((t) => t.languageCode?.toLowerCase().startsWith('en')) ||
      captionTracks[0];

    // Fetch timed text
    const captionsResp = await fetch(withFormat(selectedTrack.baseUrl, 'json3'), {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!captionsResp.ok) {
      return res.status(captionsResp.status).json({
        error: `Unable to fetch caption track (${captionsResp.status})`,
      });
    }

    const captionText = await captionsResp.text();
    let segments: ReturnType<typeof parseJson3Captions> = [];

    try {
      segments = parseJson3Captions(JSON.parse(captionText));
    } catch {
      segments = parseXmlCaptions(captionText);
    }

    // Try XML fallback if json3 returned nothing
    if (!segments.length) {
      const xmlResp = await fetch(withFormat(selectedTrack.baseUrl, 'srv3'), {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (xmlResp.ok) {
        segments = parseXmlCaptions(await xmlResp.text());
      }
    }

    if (!segments.length) {
      return res.status(422).json({ error: 'Caption track was found but could not be parsed' });
    }

    return res.status(200).json({
      videoId,
      title: videoDetails.title || `YouTube ${videoId}`,
      canonicalUrl,
      duration: Number(videoDetails.lengthSeconds || segments[segments.length - 1]?.endTime || 0),
      thumbnailUrl: videoDetails.thumbnail?.thumbnails?.slice(-1)?.[0]?.url,
      selectedTrack: {
        languageCode: selectedTrack.languageCode || 'und',
        name: getTrackName(selectedTrack),
        isAutoGenerated: selectedTrack.kind === 'asr',
      },
      tracks: captionTracks.map((t) => ({
        languageCode: t.languageCode || 'und',
        name: getTrackName(t),
        isAutoGenerated: t.kind === 'asr',
      })),
      segments,
    });
  } catch (error) {
    console.error('[YouTube Captions] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to import YouTube captions',
    });
  }
}
