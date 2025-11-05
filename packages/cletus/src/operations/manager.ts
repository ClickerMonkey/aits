import { CletusCoreContext } from "../ai";
import { ChatMode, Operation } from "../schemas";
import { OperationDefinition, OperationDefinitionFor, OperationInput, OperationKind, OperationMode, Operations } from "./types";


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
 * Operation Manager to handle operations based on the current chat mode.
 */
export class OperationManager {
  public constructor(
    public mode: ChatMode,
    public operations: Operation[] = [],
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
    
    const op: Operation = {
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
  public async execute(op: Operation, doit: boolean, ctx: CletusCoreContext): Promise<string> {
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

    const inputDetails = `<input>\n${JSON.stringify(op.input, undefined, 2)}\n</input>`

    op.message = op.error
      ? `Operation ${op.type} failed: ${op.error}\n\n${inputDetails}`
      : op.output
        ? `Operation ${op.type} completed successfully:\n\n${inputDetails}\n\n<output>\n${JSON.stringify(op.output), undefined, 2}\n</output>`
        : op.doable
          ? `Operation ${op.type} requires approval: ${op.analysis}\n\n${inputDetails}`
          : `Operation ${op.type} cannot be performed: ${op.analysis}\n\n${inputDetails}`;

    return op.message;
  }
}