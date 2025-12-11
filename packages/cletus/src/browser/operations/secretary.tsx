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
  return ({ operation }: OperationRendererProps) => {
    const { color: statusColor, label: statusLabel } = getStatusInfo(operation.status);
    const elapsed = getElapsedTime(operation);
    const summary = operation.error || (getSummary ? getSummary(operation) : null) || operation.analysis;

    return (
      <div className="mb-3 border border-yellow-400/30 rounded-lg p-3 bg-yellow-400/5">
        <div className="flex items-center gap-2 mb-2">
          <span className={cn('text-lg', statusColor)}>●</span>
          <span className="font-mono text-sm text-yellow-400">{getLabel(operation)}</span>
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

export const assistant_switch = createRenderer(
  (op) => `SwitchAssistant("${op.input.name}")`,
  (op) => op.output ? `Switched to ${op.input.name}` : null
);

export const assistant_update = createRenderer(
  (op) => `UpdateAssistant("${op.input.name}")`,
  (op) => op.output ? 'Assistant updated' : null
);

export const assistant_add = createRenderer(
  (op) => `AddAssistant("${op.input.name}")`,
  (op) => op.output ? 'Assistant created' : null
);

export const memory_list = createRenderer((op) => 'MemoryList()');

export const memory_update = createRenderer(
  (op) => 'UpdateMemory()',
  (op) => op.output ? 'Memory updated' : null
);
