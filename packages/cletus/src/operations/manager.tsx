
import { CletusAIContext } from "../ai";
import { ChatMode, Operation, OperationKind } from "../schemas";
import { OperationDefinition, OperationDefinitionFor, OperationInput, OperationMode, Operations } from "./types";


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
    public onOperationAdded?: (op: Operation, index: number) => void,
    public onOperationUpdated?: (op: Operation, index: number) => void,
  ) {
  }

  /**
   * If any operation requires approval.
   */
  public requiresApproval(offset: number = 0) {
    return this.operations.slice(offset).some(op => op.status === 'analyzed');
  }

  /**
   * If all operations are in a done state and we don't need approval.
   */
  public automatedOperations(offset: number = 0) {
    return this.operations.length > offset && !this.requiresApproval(offset);
  }

  /**
   * If the chat agent is in a state where it needs clarifications.
   */
  public needsUserInput(offset: number = 0) {
    return this.operations.length <= offset;
  }
  
  /**
   * Handle an operation based on the current mode.
   * 
   * @param operation - Operation input
   * @param ctx - Cletus core context
   * @returns Result message
   */
  public async handle<
    K extends OperationKind,
    C extends CletusAIContext,
  >(operation: OperationInput<K>, ctx: C): Promise<string> {
    const def = Operations[operation.type] as unknown as OperationDefinitionFor<K>;
    if (!def) {
      throw new Error(`Unknown operation type: ${operation.type}`);
    }
    const operationMode = typeof def.mode === 'function' ? def.mode(operation.input, ctx) : def.mode;
    const doNow = ModeLevels[this.mode] >= ModeLevels[operationMode];
    
    const op: Operation = {
      type: operation.type,
      input: operation.input,
      status: 'created',
      start: performance.now(),
    };

    this.operations.push(op);

    this.onOperationAdded?.(op, this.operations.length - 1);
    
    // Update status with operation description
    const statusMsg = def.status ? def.status(op.input) : `Processing operation: ${op.type}`;
    ctx.chatStatus(statusMsg);

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
  public async execute(op: Operation, doit: boolean, ctx: CletusAIContext): Promise<string> {
    const def = Operations[op.type] as OperationDefinition<any, any>;

    if (doit && op.status !== 'created' && op.status !== 'analyzed') {
      throw new Error(`Operation ${op.type} is not in a doable state. Current status: ${op.status}`);
    }
    if (!doit && op.status !== 'created') {
      throw new Error(`Operation ${op.type} has already been analyzed. Current status: ${op.status}`);
    }

    ctx.log(`op start: ${op.type} input=${JSON.stringify(op.input)}`);

    op.start = performance.now();
    try {
      if (doit) {
        op.status = 'doing';
        op.output = await def.do(op.input, ctx);
        op.status = 'done';
      } else {
        op.status = 'analyzing';
        const analysisResult = await def.analyze(op.input, ctx);
        op.analysis = analysisResult.analysis;
        op.status = analysisResult.doable ? 'analyzed' : 'analyzedBlocked';
      }
    } catch (e: any) {
      op.error = e.message || String(e);
      op.status = doit ? 'doneError' : 'analyzeError';
    } finally {
      op.end = performance.now();
    }

    const inputDetails = `<input>\n${JSON.stringify(op.input, undefined, 2)}\n</input>`

    op.message = op.status === 'doneError' || op.status === 'analyzeError'
      ? `Operation ${op.type} failed: ${op.error}\n\n${inputDetails}`
      : op.status === 'done'
        ? `Operation ${op.type} completed successfully:\n\n${inputDetails}\n\n<output>\n${JSON.stringify(op.output, undefined, 2)}\n</output>`
        : op.status === 'analyzed'
          ? `Operation ${op.type} requires approval: ${op.analysis}\n\n${inputDetails}`
          : `Operation ${op.type} cannot be performed: ${op.analysis}\n\n${inputDetails}`;

    this.onOperationUpdated?.(op, this.operations.indexOf(op));

    ctx.log(op);

    return op.message;
  }
}