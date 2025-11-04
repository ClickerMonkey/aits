import { CletusCoreContext } from "../ai";
import { ChatMode } from "../schemas";

import * as planner from './planner';

/**
 * Operation mode. Similar to chat mode but includes 'local' for operations
 * that can be performed without any approval (e.g. local file operations).
 * 
 * AI operations always require at least 'none' mode.
 */
export type OperationMode = ChatMode | 'local';

/**
 * Mapping of operation modes to levels for comparison purposes.
 */
const ModeLevels: Record<OperationMode, number> = {
  local: -1,
  none: 0,
  read: 1,
  create: 2,
  update: 3,
  delete: 4,
};

/**
 * Record of a performed operation.
 */
export type OperationRecord = {
  type: string;
  input: any;
  output?: any;
  analysis?: string;
  start: number;
  end?: number;
  error?: string;
  message?: string;
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
   * Analyze the operation input and return a string describing what would be done.
   * This is used when the current chat mode does not allow automatic execution.
   * 
   * @param input - Operation input
   * @param context - Cletus core context
   * @returns Analysis string
   */
  analyze: (input: TInput, context: CletusCoreContext) => Promise<string>;

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
export function operationOf<TInput, TOutput>(def: OperationDefinition<TInput, TOutput>): OperationDefinition<TInput, TOutput> {
  return def;
}

// All operations are listed here.
export const Operations = {
  ...planner,
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

/**
 * Operation Manager to handle operations based on the current chat mode.
 */
export class OperationManager {
  public constructor(
    public mode: ChatMode,
    public operations: OperationRecord[] = [],
  ) {
  }
  
  /**
   * Handle an operation based on the current mode.
   * 
   * @param operation - Operation input
   * @param ctx - Cletus core context
   * @returns Result message
   */
  public async handle<K extends OperationKind>(operation: OperationInput<K>, ctx: CletusCoreContext): Promise<string> {
    const def = Operations[operation.type] as unknown as OperationDefinitionFor<K>;
    if (!def) {
      throw new Error(`Unknown operation type: ${operation.type}`);
    }
    const operationMode = typeof def.mode === 'function' ? def.mode(operation.input, ctx) : def.mode;
    const canDo = ModeLevels[this.mode] >= ModeLevels[operationMode];
    
    const op: OperationRecord = {
      type: operation.type,
      input: operation.input,
      start: Date.now(),
    };

    this.operations.push(op);

    return this.execute(op, canDo, ctx);
  }

  /**
   * Execute the operation, either analyzing or performing it.
   * 
   * @param op - Operation record
   * @param canDo - Whether the operation can be performed automatically
   * @param ctx - Cletus core context
   * @returns Result message
   */
  public async execute(op: OperationRecord, canDo: boolean, ctx: CletusCoreContext): Promise<string> {
    const def = Operations[op.type as OperationKind] as OperationDefinition<any, any>;

    try {
      if (canDo) {
        op.output = await def.do(op.input, ctx);
      } else {
        op.analysis = await def.analyze(op.input, ctx);
      }
    } catch (e: any) {
      op.error = e.message || String(e);
    } finally {
      op.end = Date.now();
    }
    
    op.message = op.error
      ? `Operation ${op.type} failed: ${op.error}`
      : canDo
        ? `Operation ${op.type} completed successfully: ${JSON.stringify(op.output)}`
        : `Operation ${op.type} requires approval: ${op.analysis}`;
      
    return op.message;
  }
}