/**
 * Retry utility with exponential backoff and jitter for external calls.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number
  /** Base delay in ms (default: 100ms) */
  baseDelayMs?: number
  /** Maximum delay in ms (default: 5000ms) */
  maxDelayMs?: number
  /** Jitter factor 0-1 (default: 0.2) */
  jitterFactor?: number
  /** Function to determine if an error is retryable */
  isRetryable?: (error: unknown) => boolean
  /** Callback on each retry attempt */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void
}

/**
 * Default retryable error check - retries on network errors, timeouts, and 5xx errors
 */
export function isDefaultRetryable(error: unknown): boolean {
  if (!error) return false
  
  // AbortError should not be retried
  if (error instanceof DOMException && error.name === "AbortError") return false
  if (error instanceof Error && error.name === "AbortError") return false
  
  // Check for common retryable error codes
  if (error instanceof Error) {
    // Network errors
    const retryableCodes = ["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENETUNREACH", "EAI_AGAIN"]
    if ("code" in error && typeof error.code === "string" && retryableCodes.includes(error.code)) {
      return true
    }
    
    // Fetch/HTTP errors with status
    if ("status" in error && typeof error.status === "number") {
      return error.status >= 500 || error.status === 429 // 5xx or rate limited
    }
    
    // Timeout errors
    if (error.name === "TimeoutError" || error.message?.includes("timeout")) {
      return true
    }
  }
  
  // Generic catch-all for unknown transient errors
  return false
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  const exponentialDelay = Math.min(
    options.baseDelayMs * Math.pow(2, attempt),
    options.maxDelayMs
  )
  const jitter = exponentialDelay * options.jitterFactor * Math.random()
  return Math.floor(exponentialDelay + jitter)
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 100,
    maxDelayMs = 5000,
    jitterFactor = 0.2,
    isRetryable = isDefaultRetryable,
    onRetry,
  } = options
  
  let lastError: unknown
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      
      // Don't retry on the last attempt
      if (attempt === maxAttempts - 1) break
      
      // Check if error is retryable
      if (!isRetryable(error)) {
        throw error
      }
      
      const delayMs = calculateDelay(attempt, {
        maxAttempts,
        baseDelayMs,
        maxDelayMs,
        jitterFactor,
        isRetryable,
        onRetry: onRetry ?? (() => {}),
      })
      
      onRetry?.(attempt + 1, error, delayMs)
      
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  
  throw lastError
}

/**
 * Create a retry wrapper with preset options
 */
export function createRetryWrapper(options: RetryOptions) {
  return <T>(fn: () => Promise<T>) => withRetry(fn, options)
}

/**
 * Retry options for different external services
 */
export const RETRY_PRESETS = {
  /** For LSP calls - short timeout, few retries */
  lsp: {
    maxAttempts: 2,
    baseDelayMs: 50,
    maxDelayMs: 500,
    jitterFactor: 0.1,
  } as RetryOptions,
  
  /** For LLM generation - longer timeout, more retries */
  llm: {
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 10000,
    jitterFactor: 0.2,
  } as RetryOptions,
  
  /** For file system operations */
  fs: {
    maxAttempts: 3,
    baseDelayMs: 10,
    maxDelayMs: 1000,
    jitterFactor: 0.1,
    isRetryable: (error: unknown) => {
      if (error instanceof Error) {
        const retryableCodes = ["EAGAIN", "EBUSY", "EMFILE", "ENFILE", "ENOSPC", "EPERM"]
        if ("code" in error && typeof error.code === "string" && retryableCodes.includes(error.code)) {
          return true
        }
      }
      return isDefaultRetryable(error)
    },
  } as RetryOptions,
  
  /** For git/VCS operations */
  vcs: {
    maxAttempts: 2,
    baseDelayMs: 200,
    maxDelayMs: 2000,
    jitterFactor: 0.2,
  } as RetryOptions,
  
  /** For storage operations */
  storage: {
    maxAttempts: 3,
    baseDelayMs: 50,
    maxDelayMs: 2000,
    jitterFactor: 0.1,
  } as RetryOptions,
}