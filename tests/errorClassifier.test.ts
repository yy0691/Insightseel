import { describe, it, expect } from 'vitest';
import { classifyError, isRetryableError } from '../services/errorClassifier';

describe('classifyError', () => {
  it('classifies cancelled errors', () => {
    expect(classifyError(new Error('Operation aborted'))).toMatchObject({ category: 'cancelled', retryable: false });
    expect(classifyError(new Error('User cancelled'))).toMatchObject({ category: 'cancelled', retryable: false });
  });

  it('classifies auth errors', () => {
    expect(classifyError(new Error('Invalid API key provided'))).toMatchObject({ category: 'auth', retryable: false });
    expect(classifyError(new Error('invalid_api_key'))).toMatchObject({ category: 'auth', retryable: false });
    expect(classifyError(new Error('HTTP 401 Unauthorized'))).toMatchObject({ category: 'auth', retryable: false });
  });

  it('classifies quota errors', () => {
    expect(classifyError(new Error('Rate limit exceeded (429)'))).toMatchObject({ category: 'quota', retryable: true });
    expect(classifyError(new Error('resource_exhausted: quota exceeded'))).toMatchObject({ category: 'quota', retryable: true });
    expect(classifyError(new Error('insufficient_quota'))).toMatchObject({ category: 'quota', retryable: true });
    expect(classifyError(new Error('Too many requests'))).toMatchObject({ category: 'quota', retryable: true });
  });

  it('classifies timeout errors', () => {
    expect(classifyError(new Error('Request timed out'))).toMatchObject({ category: 'timeout', retryable: true });
    expect(classifyError(new Error('Gateway timeout (504)'))).toMatchObject({ category: 'timeout', retryable: true });
  });

  it('classifies server errors', () => {
    expect(classifyError(new Error('Failed to fetch YouTube captions (503)'))).toMatchObject({ category: 'server', retryable: true });
    expect(classifyError(new Error('Server is overloaded'))).toMatchObject({ category: 'server', retryable: true });
    expect(classifyError(new Error('temporarily unavailable'))).toMatchObject({ category: 'server', retryable: true });
  });

  it('classifies invalidInput errors before network', () => {
    expect(classifyError(new Error('Failed to fetch YouTube captions (404)'))).toMatchObject({ category: 'invalidInput', retryable: false });
    expect(classifyError(new Error('Failed to fetch YouTube captions (400)'))).toMatchObject({ category: 'invalidInput', retryable: false });
    expect(classifyError(new Error('Invalid YouTube URL'))).toMatchObject({ category: 'invalidInput', retryable: false });
  });

  it('classifies network errors', () => {
    expect(classifyError(new TypeError('Failed to fetch'))).toMatchObject({ category: 'network', retryable: true });
    expect(classifyError(new Error('NetworkError when attempting to fetch'))).toMatchObject({ category: 'network', retryable: true });
  });

  it('classifies noCaptions errors', () => {
    expect(classifyError(new Error('No caption tracks found'))).toMatchObject({ category: 'noCaptions', retryable: false });
    expect(classifyError(new Error('Captions not available for this video'))).toMatchObject({ category: 'noCaptions', retryable: false });
  });

  it('classifies noSpeech errors', () => {
    expect(classifyError(new Error('unable to generate valid subtitles from the audio'))).toMatchObject({ category: 'noSpeech', retryable: false });
    expect(classifyError(new Error('No speech detected in video'))).toMatchObject({ category: 'noSpeech', retryable: false });
  });

  it('classifies unsupported errors', () => {
    expect(classifyError(new Error('Unsupported audio format'))).toMatchObject({ category: 'unsupported', retryable: false });
    expect(classifyError(new Error('File too large for processing'))).toMatchObject({ category: 'unsupported', retryable: false });
  });

  it('classifies CORS errors', () => {
    expect(classifyError(new Error('CORS policy blocked this request'))).toMatchObject({ category: 'cors', retryable: false });
    expect(classifyError(new Error('cross-origin request denied'))).toMatchObject({ category: 'cors', retryable: false });
  });

  it('falls back to unknown for unrecognized errors', () => {
    expect(classifyError(new Error('Something completely unexpected'))).toMatchObject({ category: 'unknown', retryable: false });
    expect(classifyError('plain string error')).toMatchObject({ category: 'unknown', retryable: false });
  });

  it('preserves the raw message', () => {
    const msg = 'API key is invalid_api_key for this endpoint';
    const result = classifyError(new Error(msg));
    expect(result.rawMessage).toBe(msg);
  });
});

describe('isRetryableError', () => {
  it('returns true for retryable categories', () => {
    expect(isRetryableError(new Error('429 too many requests'))).toBe(true);
    expect(isRetryableError(new Error('Server is overloaded (503)'))).toBe(true);
    expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('returns false for non-retryable categories', () => {
    expect(isRetryableError(new Error('Invalid API key'))).toBe(false);
    expect(isRetryableError(new Error('No caption tracks found'))).toBe(false);
    expect(isRetryableError(new Error('Operation aborted'))).toBe(false);
  });
});
