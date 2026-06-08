export type ErrorCategory =
  | 'auth'
  | 'quota'
  | 'timeout'
  | 'network'
  | 'cors'
  | 'server'
  | 'unsupported'
  | 'noSpeech'
  | 'noCaptions'
  | 'invalidInput'
  | 'cancelled'
  | 'unknown';

export interface ClassifiedError {
  category: ErrorCategory;
  retryable: boolean;
  rawMessage: string;
}

export interface ErrorContext {
  operation?: 'subtitles' | 'youtube' | 'analysis' | 'sync' | 'import';
}

const PATTERNS: Array<{
  test: (msg: string) => boolean;
  category: ErrorCategory;
  retryable: boolean;
}> = [
  {
    test: (m) => m.includes('aborted') || m.includes('cancelled') || m.includes('canceled'),
    category: 'cancelled',
    retryable: false,
  },
  {
    test: (m) => m.includes('AUTH_REQUIRED') || m.includes('AUTH_INVALID'),
    category: 'auth',
    retryable: false,
  },
  {
    test: (m) =>
      m.includes('api key') ||
      m.includes('invalid_api_key') ||
      m.includes('invalid api key') ||
      m.includes('unauthorized') ||
      m.includes('(401)') ||
      (m.includes('401') && !m.includes('caption')),
    category: 'auth',
    retryable: false,
  },
  {
    test: (m) =>
      m.includes('429') ||
      m.includes('rate limit') ||
      m.includes('quota') ||
      m.includes('resource_exhausted') ||
      m.includes('insufficient_quota') ||
      m.includes('too many requests'),
    category: 'quota',
    retryable: true,
  },
  {
    test: (m) => m.includes('cors') || m.includes('cross-origin') || m.includes('access-control'),
    category: 'cors',
    retryable: false,
  },
  {
    test: (m) => m.includes('timeout') || m.includes('timed out') || m.includes('(504)') || m.includes('504 '),
    category: 'timeout',
    retryable: true,
  },
  {
    test: (m) =>
      m.includes('(503)') || m.includes('503 ') ||
      m.includes('(502)') || m.includes('502 ') ||
      m.includes('(500)') || m.includes('500 ') ||
      m.includes('overloaded') ||
      m.includes('temporarily unavailable') ||
      m.includes('internal server error'),
    category: 'server',
    retryable: true,
  },
  {
    test: (m) =>
      m.includes('(400)') || m.includes('(404)') ||
      m.includes('bad request') ||
      m.includes('not found') ||
      m.includes('invalid url') ||
      m.includes('invalid youtube') ||
      m.includes('malformed'),
    category: 'invalidInput',
    retryable: false,
  },
  {
    test: (m) =>
      m.includes('failed to fetch') ||
      m.includes('networkerror') ||
      m.includes('network error') ||
      m.includes('offline') ||
      m.includes('connection refused') ||
      m.includes('econnrefused'),
    category: 'network',
    retryable: true,
  },
  {
    test: (m) =>
      m.includes('no caption') ||
      m.includes('captions not available') ||
      m.includes('caption not found') ||
      m.includes('no subtitle') ||
      m.includes('subtitle not found'),
    category: 'noCaptions',
    retryable: false,
  },
  {
    test: (m) =>
      m.includes('unable to generate valid subtitles') ||
      m.includes('no speech') ||
      m.includes('no audio') ||
      m.includes('no transcript') ||
      m.includes('empty subtitles'),
    category: 'noSpeech',
    retryable: false,
  },
  {
    test: (m) =>
      m.includes('unsupported') ||
      m.includes('not supported') ||
      m.includes('file too large') ||
      m.includes('exceeds the') ||
      m.includes('invalid format'),
    category: 'unsupported',
    retryable: false,
  },
];

export function classifyError(error: unknown, _context?: ErrorContext): ClassifiedError {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const msg = rawMessage.toLowerCase();

  for (const pattern of PATTERNS) {
    if (pattern.test(msg)) {
      return { category: pattern.category, retryable: pattern.retryable, rawMessage };
    }
  }

  return { category: 'unknown', retryable: false, rawMessage };
}

export function isRetryableError(error: unknown): boolean {
  return classifyError(error).retryable;
}
