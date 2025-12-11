import React from 'react';
import { Operation } from '../../schemas';
import { getStatusInfo, getElapsedTime } from './render';
import { cn } from '../lib/utils';

interface OperationRendererProps {
  operation: Operation;
  showInput?: boolean;
  showOutput?: boolean;
}

function createRenderer(getLabel: (op: Operation) => string, getSummary?: (op: Operation) => string | null) {
  return ({ operation, showInput = false, showOutput = false }: OperationRendererProps) => {
    const { color: statusColor, label: statusLabel } = getStatusInfo(operation.status);
    const elapsed = getElapsedTime(operation);
    const label = getLabel(operation);
    const summary = operation.error || (getSummary ? getSummary(operation) : null) || operation.analysis;

    return (
      <div className="mb-3 border border-neon-purple/30 rounded-lg p-3 bg-neon-purple/5">
        <div className="flex items-center gap-2 mb-2">
          <span className={cn('text-lg', statusColor)}>●</span>
          <span className="font-mono text-sm text-neon-purple">{label}</span>
          <span className="text-xs text-muted-foreground">[{statusLabel}]</span>
          {elapsed && <span className="text-xs text-muted-foreground">({elapsed})</span>}
        </div>
        {summary && (
          <div className={cn('ml-6 text-sm', operation.error ? 'text-red-400' : 'text-muted-foreground')}>
            → {summary}
          </div>
        )}
      </div>
    );
  };
}

export const todos_list = createRenderer((op) => 'TodosList()');
export const todos_add = createRenderer((op) => `TodosAdd("${op.input.name}")`);
export const todos_done = createRenderer((op) => `TodosDone("${op.input.id}")`);
export const todos_get = createRenderer((op) => `TodosGet("${op.input.id}")`);
export const todos_remove = createRenderer((op) => `TodosRemove("${op.input.id}")`);
export const todos_replace = createRenderer((op) => 'TodosReplace()');
export const todos_clear = createRenderer((op) => 'TodosClear()');
