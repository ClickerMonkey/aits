import React from "react";
import { CletusAI, CletusAIContext } from "../ai";
import { ChatMode, Operation, OperationKind } from "../schemas";

import * as architect from './architect';
import * as artist from './artist';
import * as clerk from './clerk';
import * as dba from './dba';
import * as internet from './internet';
import * as librarian from './librarian';
import * as planner from './planner';
import * as secretary from './secretary';

/**
 * Operation mode. Similar to chat mode but includes 'local' for operations
 * that can be performed without any approval (e.g. local file operations).
 * 
 * AI operations always require at least 'none' mode.
 */
export type OperationMode = ChatMode | 'local';

/**
 * Analysis result from an operation.
 */
export type OperationAnalysis<TOutput = any, TCache = Record<string, any>> = {
  /**
   * Description of what the operation would do.
   */
  analysis: string;
  /**
   * Whether the operation can actually be performed (validation passed).
   */
  doable: boolean;
  /**
   * Optional cache data to store between analysis, execution, and rendering.
   */
  cache?: TCache;
  /**
   * If true, the operation is already complete and doesn't need execution.
   * This is useful for read-only operations that can return results during analysis.
   */
  done?: boolean;
  /**
   * Optional output if the operation is already done during analysis.
   */
  output?: TOutput;
};

/**
 * Operation with typed input and output.
 */
export type OperationOf<TInput, TOutput, TCache> = Omit<Operation, 'input' | 'output' | 'cache'> & {
  input: TInput;
  output?: TOutput;
  cache?: TCache;
}

/**
 * Definition of an operation.
 *
 * @param TInput  Type of the operation input
 * @param TOutput Type of the operation output
 */
export type OperationDefinition<TInput, TOutput, TCache> = {
  /**
   * Operation mode required to perform this operation.
   */
  mode: OperationMode | ((input: Partial<TInput>, context: CletusAIContext) => OperationMode);

  /**
   * Human-readable status message for this operation (max 64 chars recommended).
   * Should be concise and helpful without excessive input details.
   */
  status?: (input: TInput) => string;

  /**
   * Analyze the operation input and return a description and doability status.
   * This is used when the current chat mode does not allow automatic execution.
   *
   * @param input - Operation input
   * @param context - Cletus core context (contains signal for cancellation via ctx.signal)
   * @returns Analysis result with description and doability
   */
  analyze: (op: OperationOf<TInput, TOutput, TCache>, context: CletusAIContext) => Promise<OperationAnalysis<TOutput, TCache>>;

  /**
   * Run the operation and return the output.
   *
   * @param input - Operation input
   * @param context - Cletus core context (contains signal for cancellation via ctx.signal)
   * @returns - Operation output
   */
  do: (op: OperationOf<TInput, TOutput, TCache>, context: CletusAIContext) => Promise<TOutput | { output: TOutput; cache: TCache }>;

  /**
   * Optional custom content formatter for operation messages sent to the LLM.
   * If provided, this will be used to format the operation message instead of the default formatting.
   * This allows operations to control how their input/output is represented in the LLM context.
   *
   * @param op - The operation to format
   * @returns - Formatted string content for the LLM
   */
  content?: (op: OperationOf<TInput, TOutput, TCache>) => string;

  /**
   * Optional custom renderer for displaying this operation in the UI.
   * If provided, this will be used instead of the default operation display.
   *
   * @param op - The operation to render
   * @param config - Configuration file
   * @param showInput - Whether to show detailed input
   * @param showOutput - Whether to show detailed output
   * @returns - React component to display
   */
  render?: (op: OperationOf<TInput, TOutput, TCache>, ai: CletusAI, showInput?: boolean, showOutput?: boolean) => React.ReactNode;

  /**
   * A signature passed into the chat-agent's prompt to identify this operation.
   */
  signature: string;

  /**
   * Optional instructions to be included with the operation result message.
   * These instructions provide context-specific guidance to the LLM when processing operation results.
   * For example, file_read might include instructions to respect spacing and formatting.
   */
  instructions?: string;

  /**
   * Format for rendering input in operation messages. Defaults to 'yaml'.
   * - 'yaml': Renders as bullet-point list with hyphens (the default)
   * - 'json': Renders as formatted JSON
   */
  inputFormat?: 'json' | 'yaml';

  /**
   * Format for rendering output in operation messages. Defaults to 'yaml'.
   * - 'yaml': Renders as bullet-point list with hyphens (the default)
   * - 'json': Renders as formatted JSON
   */
  outputFormat?: 'json' | 'yaml';
};

// Operation definition for a specific operation kind
export type OperationDefinitionFor<K extends OperationKind> = OperationDefinition<OperationInputFor<K>, OperationOutputFor<K>, OperationCacheFor<K>>;

// Helper to define an operation
export function operationOf<TInput, TOutput, TExtension extends object = {}, TCache = {}>(def: OperationDefinition<TInput, TOutput, TCache> & TExtension): OperationDefinition<TInput, TOutput, TCache> {
  return def;
}

// All operations are listed here.
export const Operations = {
  ...planner,
  ...librarian,
  ...clerk,
  ...secretary,
  ...architect,
  ...dba,
  ...artist,
  ...internet,
} as const;

// Operation type for a specific operation kind
export type OperationFor<K extends OperationKind> = typeof Operations[K];

// Operation input and output types for a specific operation kind
export type OperationInputFor<K extends OperationKind> = OperationFor<K> extends OperationDefinition<infer I, infer O, infer C> ? I : never;

// Operation output type for a specific operation kind
export type OperationOutputFor<K extends OperationKind> = OperationFor<K> extends OperationDefinition<infer I, infer O, infer C> ? O : never;

// Operation cache type for a specific operation kind
export type OperationCacheFor<K extends OperationKind> = OperationFor<K> extends OperationDefinition<infer I, infer O, infer C> ? C : never;

// Operation input structure
export type OperationInput<K extends OperationKind> = {
  // The operation type.
  type: K;
  // The operation input.
  input: OperationInputFor<K>;
};

export const OperationModeOrder = {
  local: 0,
  none: 1,
  read: 2,
  create: 3,
  update: 4,
  delete: 5,
} as const;

/**
 * Get operation instructions based on mode and context.
 * 
 * @param ctx - Cletus AI context
 * @param def - Operation definition
 * @returns 
 */
export function getOperationInstructions(ctx: CletusAIContext, def: OperationDefinition<any, any, any>): string {
  const mode = typeof def.mode === 'function' ? def.mode({}, ctx) : def.mode;
  const chatMode = ctx.chat?.mode || 'none';
  const modeOrder = OperationModeOrder[mode];
  const chatModeOrder = OperationModeOrder[chatMode];
  const canExecute = chatModeOrder >= modeOrder;

  return !canExecute ? 'Calling this tool will only provide an analysis of what would happen - the user will be prompted to execute it or not. You should not make any tool calls after this one if they are dependent on the results of this one.' : 'This tool call will return the actual results of the operation.';
}

/**
 * Get operation input generator function.
 * 
 * @param def - Operation definition
 * @returns 
 */
export function getOperationInput(def: OperationKind) {
  return (ctx: CletusAIContext) => ({
    modeInstructions: getOperationInstructions(ctx, Operations[def]),
  });
}