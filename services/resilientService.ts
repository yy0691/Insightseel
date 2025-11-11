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
 * Check if error is retryable (temporary network/server issues)
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('503') ||
    message.includes('overloaded') ||
    message.includes('temporarily unavailable') ||
    message.includes('rate limit') ||
    message.includes('timeout') ||
    message.includes('network')
  );
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
        // Use longer delays for server overload errors
        const isOverload = isRetryableError(lastError);
        const baseDelay = isOverload ? delayMs * 3 : delayMs;
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff

        console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries} failed: ${lastError.message}`);
        console.log(`[Retry] Waiting ${(delay / 1000).toFixed(1)}s before retry...`);

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
        // Clear saved data after successful save to prevent unbounded growth
        this.savedData = [];
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
      const dataToSave = [...this.savedData];
      try {
        await retryWithBackoff(
          () => this.saveFn(dataToSave),
          {
            maxRetries: 3,
            onRetry: (attempt, error) => {
              console.log(`Retrying save (attempt ${attempt}):`, error.message);
            }
          }
        );
        // Only clear if save was successful
        this.savedData = [];
      } catch (error) {
        // Keep data for potential retry
        throw error;
      }
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

