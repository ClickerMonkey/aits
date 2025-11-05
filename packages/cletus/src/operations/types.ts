import { CletusCoreContext } from "../ai";
import { ChatMode, Operation } from "../schemas";

import * as planner from './planner';
import * as librarian from './librarian';
import * as clerk from './clerk';
import * as secretary from './secretary';
import * as architect from './architect';
import * as dba from './dba';
import * as artist from './artist';

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
export type OperationAnalysis = {
  /**
   * Description of what the operation would do.
   */
  analysis: string;
  /**
   * Whether the operation can actually be performed (validation passed).
   */
  doable: boolean;
};

/**
 * Definition of an operation.
 *
 * @param TInput  Type of the operation input
 * @param TOutput Type of the operation output
 */
export type OperationDefinition<TInput, TOutput> = {
  /**
   * Operation mode required to perform this operation.
   */
  mode: OperationMode | ((input: TInput, context: CletusCoreContext) => OperationMode);

  /**
   * Analyze the operation input and return a description and doability status.
   * This is used when the current chat mode does not allow automatic execution.
   *
   * @param input - Operation input
   * @param context - Cletus core context
   * @returns Analysis result with description and doability
   */
  analyze: (input: TInput, context: CletusCoreContext) => Promise<OperationAnalysis>;

  /**
   * Run the operation and return the output.
   *
   * @param input - Operation input
   * @param context - Cletus core context
   * @returns - Operation output
   */
  do: (input: TInput, context: CletusCoreContext) => Promise<TOutput>;
};

// Operation definition for a specific operation kind
export type OperationDefinitionFor<K extends OperationKind> = OperationDefinition<OperationInputFor<K>, OperationOutputFor<K>>;

// Helper to define an operation
export function operationOf<TInput, TOutput>(def: OperationDefinition<TInput, TOutput> & { [K in string]: K extends keyof OperationDefinition<TInput, TOutput> ? never : any }): OperationDefinition<TInput, TOutput> {
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
} as const;

// A supported operation kind
export type OperationKind = keyof typeof Operations;

// Operation type for a specific operation kind
export type OperationFor<K extends OperationKind> = typeof Operations[K];

// Operation input and output types for a specific operation kind
export type OperationInputFor<K extends OperationKind> = OperationFor<K> extends { do: (input: infer I, context: infer C) => Promise<infer R> } ? I : never;

// Operation output type for a specific operation kind
export type OperationOutputFor<K extends OperationKind> = OperationFor<K> extends { do: (input: infer I, context: infer C) => Promise<infer R> } ? R : never;

// Operation input structure
export type OperationInput<K extends OperationKind> = {
  // The operation type.
  type: K;
  // The operation input.
  input: OperationInputFor<K>;
};
