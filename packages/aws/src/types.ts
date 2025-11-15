/**
 * AWS Bedrock Provider Types
 *
 * Type definitions for AWS Bedrock provider
 */

/**
 * Base error class for AWS Bedrock-specific errors.
 *
 * Wraps underlying errors and adds provider context to error messages.
 */
export class AWSError extends Error {
  constructor(
    message: string,
    public cause?: Error
  ) {
    super(`[aws-bedrock] ${message}`);
    this.name = 'AWSError';
  }
}

/**
 * Error thrown when authentication with AWS Bedrock fails.
 */
export class AWSAuthError extends AWSError {
  constructor(cause?: Error) {
    super('Authentication failed', cause);
    this.name = 'AWSAuthError';
  }
}

/**
 * Error thrown when AWS Bedrock rate limits are exceeded.
 */
export class AWSRateLimitError extends AWSError {
  constructor(
    message: string,
    public retryAfter?: number,
    cause?: Error
  ) {
    super(message, cause);
    this.name = 'AWSRateLimitError';
  }
}

/**
 * Error thrown when AWS Bedrock quota limits are exceeded.
 */
export class AWSQuotaError extends AWSError {
  constructor(cause?: Error) {
    super('Quota exceeded', cause);
    this.name = 'AWSQuotaError';
  }
}

/**
 * Error thrown when the request exceeds the model's context window.
 */
export class AWSContextWindowError extends AWSError {
  constructor(
    message: string,
    public contextWindow?: number,
    cause?: Error
  ) {
    super(message, cause);
    this.name = 'AWSContextWindowError';
  }
}

/**
 * AWS Bedrock model families
 */
export type BedrockModelFamily =
  | 'anthropic'
  | 'amazon'
  | 'meta'
  | 'mistral'
  | 'cohere'
  | 'ai21'
  | 'stability';

/**
 * Configuration for specific model families
 */
export interface ModelFamilyConfig {
  // Enable/disable specific model families
  enabled?: boolean;
  // Custom model ID mappings
  modelIdMap?: Record<string, string>;
}
