type CaptionTrack = {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
  name?: { simpleText?: string; runs?: Array<{ text: string }> };
};

function extractVideoId(input: string): string | null {
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

function getTrackName(track: CaptionTrack): string {
  if (track.name?.simpleText) {
    return track.name.simpleText;
  }
  if (track.name?.runs?.length) {
    return track.name.runs.map((run) => run.text).join('');
  }
  return track.languageCode || 'Subtitle';
}

function extractBalancedJson(html: string, marker: string): any | null {
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

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseJson3Captions(data: any) {
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

function parseXmlCaptions(xml: string) {
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

function withFormat(url: string, format: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set('fmt', format);
  return parsed.toString();
}

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
    const watchResponse = await fetch(canonicalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!watchResponse.ok) {
      return res.status(watchResponse.status).json({ error: `Unable to fetch YouTube page (${watchResponse.status})` });
    }

    const html = await watchResponse.text();
    const playerResponse = extractBalancedJson(html, 'ytInitialPlayerResponse');
    const videoDetails = playerResponse?.videoDetails || {};
    const captionTracks: CaptionTrack[] =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

    if (!captionTracks.length) {
      return res.status(404).json({ error: 'No captions found for this YouTube video' });
    }

    const preferred = typeof preferredLanguage === 'string' ? preferredLanguage.toLowerCase() : '';
    const selectedTrack =
      captionTracks.find((track) => preferred && track.languageCode?.toLowerCase().startsWith(preferred)) ||
      captionTracks.find((track) => track.languageCode?.toLowerCase().startsWith('zh')) ||
      captionTracks.find((track) => track.languageCode?.toLowerCase().startsWith('en')) ||
      captionTracks[0];

    const captionsResponse = await fetch(withFormat(selectedTrack.baseUrl, 'json3'), {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!captionsResponse.ok) {
      return res.status(captionsResponse.status).json({ error: `Unable to fetch caption track (${captionsResponse.status})` });
    }

    const captionText = await captionsResponse.text();
    let segments = [];
    try {
      segments = parseJson3Captions(JSON.parse(captionText));
    } catch {
      segments = parseXmlCaptions(captionText);
    }

    if (!segments.length) {
      const xmlResponse = await fetch(withFormat(selectedTrack.baseUrl, 'srv3'), {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (xmlResponse.ok) {
        segments = parseXmlCaptions(await xmlResponse.text());
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
      tracks: captionTracks.map((track) => ({
        languageCode: track.languageCode || 'und',
        name: getTrackName(track),
        isAutoGenerated: track.kind === 'asr',
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
