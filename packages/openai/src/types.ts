/**
 * Provider-specific types and utilities
 *
 * Common types and helpers for implementing AI providers.
 */

// Placeholder for provider-specific types
// This will be filled in when implementing specific providers

/**
 * Base error class for provider-specific errors.
 *
 * Wraps underlying errors and adds provider context to error messages.
 * All provider errors extend from this base class.
 *
 * @example
 * ```typescript
 * throw new ProviderError('openai', 'Invalid model specified', originalError);
 * ```
 */
export class ProviderError extends Error {
  constructor(
    // The provider identifier (e.g., 'openai', 'anthropic')
    public provider: string,
    message: string,
    // Original error that caused this provider error
    public cause?: Error
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
  }
}

/**
 * Error thrown when authentication with the provider fails.
 *
 * This typically indicates an invalid API key, expired credentials,
 * or insufficient permissions.
 *
 * @example
 * ```typescript
 * throw new ProviderAuthError('openai', originalError);
 * ```
 */
export class ProviderAuthError extends ProviderError {
  constructor(provider: string, cause?: Error) {
    super(provider, `Authentication failed`, cause);
    this.name = 'ProviderAuthError';
  }
}

/**
 * Error thrown when rate limits are exceeded.
 *
 * Contains information about when the request can be retried.
 * Rate limits are enforced by the provider to control API usage.
 *
 * @example
 * ```typescript
 * throw new RateLimitError('openai', 'Too many requests', 60, originalError);
 * ```
 */
export class RateLimitError extends ProviderError {
  constructor(
    provider: string,
    message: string,
    // Number of seconds to wait before retrying
    public retryAfter?: number,
    cause?: Error
  ) {
    super(provider, message, cause);
    this.name = 'RateLimitError';
  }
}

/**
 * Error thrown when provider rate limits are exceeded.
 *
 * Specialized version of RateLimitError with a standard message.
 *
 * @example
 * ```typescript
 * throw new ProviderRateLimitError('openai', 60, originalError);
 * ```
 */
export class ProviderRateLimitError extends RateLimitError {
  constructor(
    provider: string,
    // Number of seconds to wait before retrying
    public retryAfter?: number,
    cause?: Error
  ) {
    super(provider, `Rate limit exceeded`, retryAfter, cause);
    this.name = 'ProviderRateLimitError';
  }
}

/**
 * Error thrown when quota limits are exceeded.
 *
 * This indicates the account has reached its usage quota
 * and needs to upgrade or wait for quota reset.
 *
 * @example
 * ```typescript
 * throw new ProviderQuotaError('openai', originalError);
 * ```
 */
export class ProviderQuotaError extends ProviderError {
  constructor(provider: string, cause?: Error) {
    super(provider, `Quota exceeded`, cause);
    this.name = 'ProviderQuotaError';
  }
}

/**
 * Error thrown when the request exceeds the model's context window.
 *
 * This typically occurs with status 413 when the input is too long
 * for the model's maximum context length.
 *
 * @example
 * ```typescript
 * throw new ContextWindowError('openai', 'Input too long', 128000, originalError);
 * ```
 */
export class ContextWindowError extends ProviderError {
  constructor(
    provider: string,
    message: string,
    // The context window size in tokens (if known)
    public contextWindow?: number,
    cause?: Error
  ) {
    super(provider, message, cause);
    this.name = 'ContextWindowError';
  }
}
