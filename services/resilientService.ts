/**
 * Resilient Service - Provides retry logic and incremental saving
 * for long-running AI operations
 */

interface RetryOptions {
  maxRetries?: number;
  delayMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    delayMs = 1000,
    onRetry
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = delayMs * Math.pow(2, attempt); // Exponential backoff
        onRetry?.(attempt + 1, lastError);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Operation failed after all retries');
}

/**
 * Save data incrementally with error recovery
 */
export class IncrementalSaver {
  private savedData: any[] = [];
  private saveFn: (data: any) => Promise<void>;
  private intervalMs: number;
  private lastSaveTime: number = 0;

  constructor(
    saveFn: (data: any) => Promise<void>,
    intervalMs: number = 5000 // Save every 5 seconds by default
  ) {
    this.saveFn = saveFn;
    this.intervalMs = intervalMs;
  }

  /**
   * Add data and save if interval has passed
   */
  async add(data: any, force: boolean = false): Promise<void> {
    this.savedData.push(data);

    const now = Date.now();
    const shouldSave = force || (now - this.lastSaveTime >= this.intervalMs);

    if (shouldSave && this.savedData.length > 0) {
      try {
        await this.saveFn(this.savedData);
        this.lastSaveTime = now;
      } catch (error) {
        console.error('Failed to save incrementally:', error);
        // Don't throw - we'll retry on next add
      }
    }
  }

  /**
   * Force save all pending data
   */
  async flush(): Promise<void> {
    if (this.savedData.length > 0) {
      await retryWithBackoff(
        () => this.saveFn(this.savedData),
        {
          maxRetries: 3,
          onRetry: (attempt, error) => {
            console.log(`Retrying save (attempt ${attempt}):`, error.message);
          }
        }
      );
      this.savedData = [];
    }
  }

  /**
   * Get saved data (for recovery)
   */
  getSaved(): any[] {
    return [...this.savedData];
  }

  /**
   * Clear saved data
   */
  clear(): void {
    this.savedData = [];
  }
}

/**
 * Network error detection
 */
export function isNetworkError(error: any): boolean {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  if (error.name === 'NetworkError') {
    return true;
  }
  if (error.message?.includes('network') || error.message?.includes('timeout')) {
    return true;
  }
  return false;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any): boolean {
  // Network errors are retryable
  if (isNetworkError(error)) {
    return true;
  }
  
  // HTTP 5xx errors are retryable
  if (error.status >= 500 && error.status < 600) {
    return true;
  }
  
  // Rate limit errors are retryable (with longer delay)
  if (error.status === 429) {
    return true;
  }
  
  return false;
}
