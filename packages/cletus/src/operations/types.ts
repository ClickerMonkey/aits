import { CletusCoreContext } from "../ai";
import { ChatMode } from "../schemas";

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
  doable?: boolean;
  start: number;
  end?: number;
  error?: string;
  message?: string;
};

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
    const doNow = ModeLevels[this.mode] >= ModeLevels[operationMode];
    
    const op: OperationRecord = {
      type: operation.type,
      input: operation.input,
      start: 0,
      doable: true,
    };

    this.operations.push(op);

    return this.execute(op, doNow, ctx);
  }

  /**
   * Execute the operation, either analyzing or performing it.
   *
   * @param op - Operation record
   * @param doit - Whether the operation can be performed automatically
   * @param ctx - Cletus core context
   * @returns Result message
   */
  public async execute(op: OperationRecord, doit: boolean, ctx: CletusCoreContext): Promise<string> {
    const def = Operations[op.type as OperationKind] as OperationDefinition<any, any>;

    if (!op.doable && doit) {
      throw new Error(`Operation ${op.type} is not doable`);
    }

    op.start = performance.now();
    try {
      if (doit) {
        op.output = await def.do(op.input, ctx);
      } else {
        const analysisResult = await def.analyze(op.input, ctx);
        op.analysis = analysisResult.analysis;
        op.doable = analysisResult.doable;
      }
    } catch (e: any) {
      op.error = e.message || String(e);
      op.doable = false;
    } finally {
      op.end = performance.now();
    }

    op.message = op.error
      ? `Operation ${op.type} failed: ${op.error}`
      : doit
        ? `Operation ${op.type} completed successfully: ${JSON.stringify(op.output)}`
        : op.doable
          ? `Operation ${op.type} requires approval: ${op.analysis}`
          : `Operation ${op.type} cannot be performed: ${op.analysis}`;

    return op.message;
  }
}