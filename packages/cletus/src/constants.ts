
/**
 * General constants for Cletus operations
 */
export const CONSTS = {
  SUB_AGENT_CONTEXT_MESSAGES: 10, // Number of recent messages to pass to toolsets
  MAX_CHARACTERS: 64_000,
  MAX_LINES: 1_000,
  MAX_EXTRACTION_CHUNK_SIZE: 64_000, // Maximum size for data extraction to minimize LLM calls
  OPERATION_MESSAGE_TRUNCATE_LIMIT: 2000, // Maximum size for operation messages before truncation
  OPERATION_MESSAGE_TRUNCATE_BUFFER: 200, // Buffer to ensure we don't exceed the truncate limit
} as const;

/**
 * Adaptive tooling constants
 */
export const ADAPTIVE_TOOLING = {
  /** Number of recent user messages to use for embedding-based tool selection */
  USER_MESSAGES_FOR_EMBEDDING: 5,
  /** Number of highest-scoring tools to select in adaptive mode */
  TOP_TOOLS_TO_SELECT: 14,
} as const;

/**
 * Autonomous operation constants
 */
export const AUTONOMOUS = {
  /** Default maximum number of autonomous loop iterations */
  DEFAULT_MAX_ITERATIONS: 10,
  /** Default timeout for autonomous operations in milliseconds (5 minutes) */
  DEFAULT_TIMEOUT_MS: 5 * 60 * 1000,
  /** Minimum allowed iterations */
  MIN_ITERATIONS: 1,
  /** Minimum allowed timeout in milliseconds (1 second) */
  MIN_TIMEOUT_MS: 1000,
  /** Milliseconds per minute for time conversions */
  MS_PER_MINUTE: 60 * 1000,
} as const;

/**
 * Default prompt file names (in order of precedence)
 */
export const DEFAULT_PROMPT_FILES = ['cletus.md', 'agents.md', 'claude.md'] as const;
