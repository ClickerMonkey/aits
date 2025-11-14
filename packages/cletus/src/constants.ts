/**
 * Color constants for the Cletus UI
 */
export const COLORS = {
  // User colors
  USER: '#9d4edd' as const, // Purple instead of magenta
  USER_INPUT_BORDER: '#9d4edd' as const,
  USER_INPUT_PROMPT: '#9d4edd' as const,

  // Assistant colors
  ASSISTANT: 'green' as const,

  // System colors
  SYSTEM: 'yellow' as const,

  // Status indicator colors
  STATUS_USER: '#9d4edd' as const, // Purple circle for user messages
  STATUS_NO_OPS: 'gray' as const, // Gray circle for no operations
  STATUS_DONE: 'green' as const, // Green circle for completed operations
  STATUS_ANALYZED: 'yellow' as const, // Yellow circle for operations needing approval
  STATUS_IN_PROGRESS: 'rgb(255,165,0)' as const, // Orange circle for in-progress operations

  // Operation approval menu colors
  APPROVAL_BORDER: 'yellow' as const,
  APPROVAL_SELECTED: 'cyan' as const,
  APPROVAL_UNSELECTED: 'white' as const,

  // Processing states
  PROCESSING_BORDER: 'cyan' as const,
  PROCESSING_TEXT: 'cyan' as const,

  // Completion states
  SUCCESS_BORDER: 'green' as const,
  SUCCESS_TEXT: 'green' as const,
  ERROR_BORDER: 'red' as const,
  ERROR_TEXT: 'red' as const,

  // Input states
  INPUT_TRANSCRIBING: 'blue' as const,
  INPUT_WAITING: 'gray' as const,
  INPUT_APPROVAL_MENU: 'gray' as const,

  // Markdown colors
  MARKDOWN_HEADING: 'cyan' as const,

  // Other UI elements
  DIM_TEXT: 'gray' as const,
} as const;

/**
 * Type for color values
 */
export type ColorValue = typeof COLORS[keyof typeof COLORS];

/**
 * General constants for Cletus operations
 */
export const CONSTS = {
  EMBED_CHUNK_SIZE: 1000,
  MAX_CHARACTERS: 64_000,
  MAX_LINES: 1_000,
  MAX_EXTRACTION_CHUNK_SIZE: 64_000, // Maximum size for data extraction to minimize LLM calls
};

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
