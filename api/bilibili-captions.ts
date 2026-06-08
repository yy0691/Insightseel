import crypto from 'crypto';

/**
 * Bilibili caption importer.
 *
 * Bilibili exposes closed captions (CC字幕) through its WBI-signed player API.
 * Note: many videos either have no CC track or only expose AI-generated tracks
 * to logged-in users. When no track is available we return a clear 404 so the
 * frontend can suggest the recording flow instead.
 */

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const BILI_HEADERS = {
  'User-Agent': DESKTOP_UA,
  Referer: 'https://www.bilibili.com',
  Origin: 'https://www.bilibili.com',
};

// Fixed permutation table used by Bilibili's WBI signing scheme.
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

export function extractBvid(input: string): string | null {
  // Accept raw BV ids, or any bilibili URL containing /video/BVxxxx
  const direct = input.trim().match(/^(BV[0-9A-Za-z]+)$/);
  if (direct) return direct[1];
  const inUrl = input.match(/\/video\/(BV[0-9A-Za-z]+)/);
  if (inUrl) return inUrl[1];
  return null;
}

export function extractAvid(input: string): number | null {
  const direct = input.trim().match(/^av(\d+)$/i);
  if (direct) return Number(direct[1]);
  const inUrl = input.match(/\/video\/av(\d+)/i);
  if (inUrl) return Number(inUrl[1]);
  return null;
}

export function getMixinKey(imgKey: string, subKey: string): string {
  const raw = imgKey + subKey;
  let key = '';
  for (const idx of MIXIN_KEY_ENC_TAB) {
    key += raw[idx] ?? '';
  }
  return key.slice(0, 32);
}

export function encodeWbi(
  params: Record<string, string | number>,
  mixinKey: string,
  timestamp: number,
): string {
  const signed: Record<string, string | number> = { ...params, wts: timestamp };
  const query = Object.keys(signed)
    .sort()
    .map((k) => {
      // Bilibili strips !'()* from values before signing.
      const value = String(signed[k]).replace(/[!'()*]/g, '');
      return `${encodeURIComponent(k)}=${encodeURIComponent(value)}`;
    })
    .join('&');
  const wRid = crypto.createHash('md5').update(query + mixinKey).digest('hex');
  return `${query}&w_rid=${wRid}`;
}

async function fetchWbiKeys(): Promise<{ imgKey: string; subKey: string } | null> {
  try {
    const resp = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      headers: BILI_HEADERS,
    });
    const data = await resp.json();
    const imgUrl: string = data?.data?.wbi_img?.img_url ?? '';
    const subUrl: string = data?.data?.wbi_img?.sub_url ?? '';
    if (!imgUrl || !subUrl) return null;
    const imgKey = imgUrl.slice(imgUrl.lastIndexOf('/') + 1).split('.')[0];
    const subKey = subUrl.slice(subUrl.lastIndexOf('/') + 1).split('.')[0];
    return { imgKey, subKey };
  } catch {
    return null;
  }
}

interface BiliViewInfo {
  bvid: string;
  aid: number;
  cid: number;
  title: string;
  duration: number;
  pic: string;
}

async function fetchVideoInfo(idParam: string): Promise<BiliViewInfo | null> {
  const resp = await fetch(`https://api.bilibili.com/x/web-interface/view?${idParam}`, {
    headers: BILI_HEADERS,
  });
  const data = await resp.json();
  if (data?.code !== 0 || !data?.data) return null;
  const d = data.data;
  return {
    bvid: d.bvid,
    aid: d.aid,
    cid: d.cid,
    title: d.title,
    duration: d.duration,
    pic: d.pic,
  };
}

interface BiliSubtitleMeta {
  lan: string;
  lan_doc: string;
  subtitle_url: string;
  ai_status?: number;
}

function normalizeUrl(url: string): string {
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { url, preferredLanguage } = body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing Bilibili URL' });
    }

    const bvid = extractBvid(url);
    const avid = bvid ? null : extractAvid(url);
    if (!bvid && !avid) {
      return res.status(400).json({ error: 'Invalid Bilibili URL' });
    }
    const idParam = bvid ? `bvid=${bvid}` : `aid=${avid}`;

    const info = await fetchVideoInfo(idParam);
    if (!info) {
      return res.status(502).json({
        error: 'Could not retrieve video data from Bilibili. The video may be unavailable or region-restricted.',
      });
    }

    const canonicalUrl = `https://www.bilibili.com/video/${info.bvid}`;

    const keys = await fetchWbiKeys();
    if (!keys) {
      return res.status(502).json({ error: 'Failed to obtain Bilibili signing keys.' });
    }
    const mixinKey = getMixinKey(keys.imgKey, keys.subKey);
    const query = encodeWbi(
      { bvid: info.bvid, cid: info.cid },
      mixinKey,
      Math.floor(Date.now() / 1000),
    );

    const playerResp = await fetch(`https://api.bilibili.com/x/player/wbi/v2?${query}`, {
      headers: BILI_HEADERS,
    });
    const playerData = await playerResp.json();
    const subtitles: BiliSubtitleMeta[] = playerData?.data?.subtitle?.subtitles ?? [];

    if (!subtitles.length) {
      return res.status(404).json({
        error:
          'No captions found for this video. Bilibili AI captions usually require login, and many videos have no CC track. Try the recording option instead.',
      });
    }

    const preferred = typeof preferredLanguage === 'string' ? preferredLanguage.toLowerCase() : '';
    const selected =
      subtitles.find((s) => preferred && s.lan?.toLowerCase().startsWith(preferred)) ||
      subtitles.find((s) => s.lan?.toLowerCase().startsWith('zh')) ||
      subtitles.find((s) => s.lan?.toLowerCase().startsWith('en')) ||
      subtitles[0];

    const subResp = await fetch(normalizeUrl(selected.subtitle_url), { headers: BILI_HEADERS });
    if (!subResp.ok) {
      return res.status(subResp.status).json({
        error: `Unable to fetch caption track (${subResp.status})`,
      });
    }
    const subJson = await subResp.json();
    const bodyItems: Array<{ from: number; to: number; content: string }> = subJson?.body ?? [];

    const segments = bodyItems
      .map((item) => ({
        startTime: item.from,
        endTime: item.to,
        text: (item.content || '').replace(/\s+/g, ' ').trim(),
      }))
      .filter((seg) => Number.isFinite(seg.startTime) && seg.text.length > 0);

    if (!segments.length) {
      return res.status(422).json({ error: 'Caption track was found but could not be parsed' });
    }

    return res.status(200).json({
      videoId: info.bvid,
      title: info.title || `Bilibili ${info.bvid}`,
      canonicalUrl,
      duration: info.duration || segments[segments.length - 1]?.endTime || 0,
      thumbnailUrl: normalizeUrl(info.pic || ''),
      selectedTrack: {
        languageCode: selected.lan || 'und',
        name: selected.lan_doc || selected.lan || 'Subtitle',
        isAutoGenerated: (selected.ai_status ?? 0) > 0,
      },
      tracks: subtitles.map((s) => ({
        languageCode: s.lan || 'und',
        name: s.lan_doc || s.lan || 'Subtitle',
        isAutoGenerated: (s.ai_status ?? 0) > 0,
      })),
      segments,
    });
  } catch (error) {
    console.error('[Bilibili Captions] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to import Bilibili captions',
    });
  }
}
