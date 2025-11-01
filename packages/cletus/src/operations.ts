import type { Operation, ChatMeta } from './schemas.js';

/**
 * Operation handler function type
 */
export type OperationHandler = (input: any, signal?: AbortSignal) => Promise<any>;

/**
 * Registry of operation handlers
 */
const operationHandlers = new Map<string, OperationHandler>();

/**
 * Register an operation handler
 */
export function registerOperationHandler(type: string, handler: OperationHandler): void {
  operationHandlers.set(type, handler);
}

/**
 * Execute an operation with the registered handler
 */
export async function executeOperation(
  operation: Operation,
  signal?: AbortSignal
): Promise<any> {
  const handler = operationHandlers.get(operation.type);
  if (!handler) {
    throw new Error(`No handler registered for operation type: ${operation.type}`);
  }

  const start = Date.now();
  try {
    const results = await handler(operation.input, signal);
    operation.start = start;
    operation.end = Date.now();
    operation.results = results;
    return results;
  } catch (error: any) {
    operation.start = start;
    operation.end = Date.now();
    operation.error = error.message || String(error);
    throw error;
  }
}

/**
 * Determine if an operation should be automatically executed based on chat mode
 */
export function shouldAutoExecute(mode: ChatMeta['mode'], kind: Operation['kind']): boolean {
  switch (mode) {
    case 'none':
      return false;
    case 'read':
      return kind === 'read';
    case 'create':
      return kind === 'read' || kind === 'create';
    case 'update':
      return kind === 'read' || kind === 'create' || kind === 'update';
    case 'delete':
      return true;
    default:
      return false;
  }
}
