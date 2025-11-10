/**
 * Retry Utility Module
 *
 * Provides exponential backoff retry logic with jitter, timeout support,
 * and flexible configuration for handling transient failures.
 */

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds before first retry (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds between retries (default: 60000) */
  maxDelay?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Whether to add random jitter to delays (default: true) */
  jitter?: boolean;
  /** HTTP status codes that should trigger a retry (default: [0, 429, 500, 503]) */
  retryableStatuses?: number[];
  /** Regex patterns for error messages that should trigger a retry */
  retryableMessages?: RegExp[];
  /** Timeout in milliseconds for each request attempt (optional) */
  timeout?: number;
}

/**
 * Context information passed to retry event handlers.
 */
export interface RetryContext {
  /** The operation being performed (e.g., 'chat', 'image', 'transcribe') */
  operation: string;
  /** The model being used (if applicable) */
  model?: string;
  /** The provider name */
  provider: string;
  /** Timestamp when the operation started */
  startTime: number;
  /** Optional request identifier for tracking */
  requestId?: string;
}

/**
 * Event handlers for retry lifecycle events.
 */
export interface RetryEvents {
  /** Called before each retry attempt */
  onRetry?: (attempt: number, error: Error, delay: number, context: RetryContext) => void;
  /** Called when a request times out */
  onTimeout?: (duration: number, context: RetryContext) => void;
  /** Called when max retries are exceeded */
  onMaxRetriesExceeded?: (attempts: number, lastError: Error, context: RetryContext) => void;
  /** Called when operation succeeds (includes retry count and total duration) */
  onSuccess?: (attempts: number, duration: number, context: RetryContext) => void;
}

/**
 * Default retry configuration.
 */
const DEFAULT_RETRY_CONFIG: Required<Omit<RetryConfig, 'timeout' | 'retryableMessages'>> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 60000,
  backoffMultiplier: 2,
  jitter: true,
  retryableStatuses: [0, 429, 500, 503],
};

/**
 * Context window error patterns for 413 status code.
 * These patterns indicate the request exceeded the model's context window.
 */
const CONTEXT_WINDOW_PATTERNS = [
  /context.*(?:length|window|size|limit).*exceeded/i,
  /maximum.*context.*(?:length|window|size)/i,
  /(?:prompt|input|message).*too.*(?:long|large)/i,
  /token.*limit.*exceeded/i,
  /context.*capacity/i,
  /request\s+too\s+large/i,
];

/**
 * Parsed information from a context window error.
 */
export interface ContextWindowInfo {
  /** Estimated context window size in tokens (if parseable from error) */
  contextWindow?: number;
  /** The original error message */
  message: string;
}

/**
 * Checks if an error is related to context window limits.
 *
 * @param error - The error to check
 * @returns True if the error indicates a context window issue
 */
export function isContextWindowError(error: any): boolean {
  if (!error) return false;

  const status = error.status || error.statusCode;
  if (status !== 413 && status !== 429) return false;

  const message = error.message || '';
  return CONTEXT_WINDOW_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Parses context window information from an error.
 *
 * @param error - The error to parse
 * @returns Context window information if parseable
 */
export function parseContextWindowError(error: any): ContextWindowInfo | null {
  if (!isContextWindowError(error)) return null;

  const message = error.message || '';

  // Try to extract context window size from error message
  // Common patterns: "maximum context length is 128000", "context window of 8192"
  const sizePatterns = [
    /(?:maximum|max).*context.*(?:length|window|size).*?(?:is|of)?\s*(\d+)/i,
    /context.*(?:length|window|size).*?(?:is|of)?\s*(\d+)/i,
    /(\d+).*token.*(?:limit|maximum|max)/i,
    /limit\s+(\d+)/i,
  ];

  let contextWindow: number | undefined;
  for (const pattern of sizePatterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      contextWindow = parseInt(match[1], 10);
      break;
    }
  }

  return {
    contextWindow,
    message,
  };
}

/**
 * Checks if an error should trigger a retry based on status code and message patterns.
 *
 * @param error - The error to check
 * @param config - Retry configuration
 * @returns True if the error is retryable
 */
export function isRetryableError(error: any, config: RetryConfig): boolean {
  if (!error) return false;

  // Never retry context window errors (413 with specific messages)
  if (isContextWindowError(error)) {
    return false;
  }

  // Check status code
  const status = error.status || error.statusCode || 0;
  const retryableStatuses = config.retryableStatuses || DEFAULT_RETRY_CONFIG.retryableStatuses;

  if (retryableStatuses.includes(status)) {
    return true;
  }

  // Check message patterns
  if (config.retryableMessages && config.retryableMessages.length > 0) {
    const message = error.message || '';
    return config.retryableMessages.some((pattern) => pattern.test(message));
  }

  return false;
}

/**
 * Calculates the delay before the next retry attempt using exponential backoff.
 *
 * @param attempt - The current attempt number (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoff(attempt: number, config: RetryConfig): number {
  const initialDelay = config.initialDelay ?? DEFAULT_RETRY_CONFIG.initialDelay;
  const maxDelay = config.maxDelay ?? DEFAULT_RETRY_CONFIG.maxDelay;
  const multiplier = config.backoffMultiplier ?? DEFAULT_RETRY_CONFIG.backoffMultiplier;
  const jitter = config.jitter ?? DEFAULT_RETRY_CONFIG.jitter;

  // Calculate exponential backoff: initialDelay * (multiplier ^ attempt)
  let delay = initialDelay * Math.pow(multiplier, attempt);

  // Cap at maxDelay
  delay = Math.min(delay, maxDelay);

  // Add jitter: random value between 0 and delay
  if (jitter) {
    delay = Math.random() * delay;
  }

  return Math.floor(delay);
}

/**
 * Sleeps for the specified duration.
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps an async operation with retry logic and timeout support.
 *
 * @param operation - The async operation to execute
 * @param context - Context information for event handlers
 * @param config - Retry configuration
 * @param events - Event handlers
 * @param signal - Optional AbortSignal for cancellation
 * @returns Promise that resolves with the operation result
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => await apiCall(),
 *   { operation: 'chat', provider: 'openai' },
 *   { maxRetries: 3, initialDelay: 1000 },
 *   { onRetry: (attempt, error, delay) => console.log(`Retry ${attempt} after ${delay}ms`) }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  context: RetryContext,
  config: RetryConfig = {},
  events?: RetryEvents,
  signal?: AbortSignal
): Promise<T> {
  const maxRetries = config.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries;
  const timeout = config.timeout;

  let lastError: Error | undefined;
  let attempt = 0;

  while (attempt <= maxRetries) {
    // Check if operation was cancelled
    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }

    try {
      let result: T;

      // Apply timeout if configured
      if (timeout) {
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

        try {
          result = await Promise.race([
            operation(),
            new Promise<never>((_, reject) => {
              timeoutController.signal.addEventListener('abort', () => {
                events?.onTimeout?.(timeout, context);
                reject(new Error(`Operation timed out after ${timeout}ms`));
              });
            }),
          ]);
          clearTimeout(timeoutId);
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      } else {
        result = await operation();
      }

      // Success! Emit event and return result
      const duration = Date.now() - context.startTime;
      events?.onSuccess?.(attempt, duration, context);
      return result;

    } catch (error) {
      lastError = error as Error;

      // Check for context window errors (413 with specific patterns)
      if (isContextWindowError(error)) {
        // Don't retry, but let the caller handle this specially
        throw error;
      }

      // Check if we should retry
      const shouldRetry = attempt < maxRetries && isRetryableError(error, config);

      if (!shouldRetry) {
        // No more retries or non-retryable error
        if (attempt >= maxRetries) {
          events?.onMaxRetriesExceeded?.(attempt, lastError, context);
        }
        throw error;
      }

      // Calculate backoff delay
      const delay = calculateBackoff(attempt, config);

      // Emit retry event
      events?.onRetry?.(attempt, lastError, delay, context);

      // Wait before retrying
      await sleep(delay);

      attempt++;
    }
  }

  // Should never reach here, but just in case
  throw lastError || new Error('Operation failed after all retries');
}
