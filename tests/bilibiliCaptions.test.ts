import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
  extractBvid,
  extractAvid,
  getMixinKey,
  encodeWbi,
} from '../api/bilibili-captions';

describe('extractBvid', () => {
  it('extracts BV id from a standard video URL', () => {
    expect(extractBvid('https://www.bilibili.com/video/BV1xx411c7mD')).toBe('BV1xx411c7mD');
  });

  it('extracts BV id with extra query params', () => {
    expect(extractBvid('https://www.bilibili.com/video/BV1xx411c7mD?p=2&t=10')).toBe('BV1xx411c7mD');
  });

  it('accepts a raw BV id', () => {
    expect(extractBvid('BV1xx411c7mD')).toBe('BV1xx411c7mD');
  });

  it('returns null for non-BV input', () => {
    expect(extractBvid('https://www.bilibili.com/video/av170001')).toBeNull();
  });
});

describe('extractAvid', () => {
  it('extracts av id from URL', () => {
    expect(extractAvid('https://www.bilibili.com/video/av170001')).toBe(170001);
  });

  it('accepts a raw av id', () => {
    expect(extractAvid('av170001')).toBe(170001);
  });

  it('returns null for BV input', () => {
    expect(extractAvid('https://www.bilibili.com/video/BV1xx411c7mD')).toBeNull();
  });
});

describe('getMixinKey', () => {
  it('produces a 32-char key from img/sub keys', () => {
    const imgKey = '7cd084941338484aae1ad9425b84077c';
    const subKey = '4932caff0ff746eab6f01bf08b70ac45';
    const mixin = getMixinKey(imgKey, subKey);
    expect(mixin).toHaveLength(32);
  });
});

describe('encodeWbi', () => {
  it('sorts params, appends wts and a valid w_rid', () => {
    const mixinKey = getMixinKey(
      '7cd084941338484aae1ad9425b84077c',
      '4932caff0ff746eab6f01bf08b70ac45',
    );
    const ts = 1700000000;
    const signed = encodeWbi({ bvid: 'BV1xx411c7mD', cid: 123 }, mixinKey, ts);

    expect(signed).toContain('bvid=BV1xx411c7mD');
    expect(signed).toContain('cid=123');
    expect(signed).toContain(`wts=${ts}`);

    const wRid = signed.match(/w_rid=([0-9a-f]{32})/)?.[1];
    expect(wRid).toBeDefined();

    const query = signed.replace(/&w_rid=[0-9a-f]{32}$/, '');
    const expected = createHash('md5').update(query + mixinKey).digest('hex');
    expect(wRid).toBe(expected);
  });
});
