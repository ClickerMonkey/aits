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
      <div className="mb-3 border border-purple-400/30 rounded-lg p-3 bg-purple-400/5">
        <div className="flex items-center gap-2 mb-2">
          <span className={cn('text-lg', statusColor)}>●</span>
          <span className="font-mono text-sm text-purple-400">{getLabel(operation)}</span>
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

export const knowledge_search = createRenderer(
  (op) => `KnowledgeSearch("${op.input.query}")`,
  (op) => op.output?.results?.length ? `Found ${op.output.results.length} result${op.output.results.length !== 1 ? 's' : ''}` : null
);

export const knowledge_sources = createRenderer((op) => 'KnowledgeSources()');

export const knowledge_add = createRenderer(
  (op) => `KnowledgeAdd("${op.input.source}")`,
  (op) => op.output?.added ? `Added ${op.output.added} entr${op.output.added !== 1 ? 'ies' : 'y'}` : null
);

export const knowledge_delete = createRenderer(
  (op) => `KnowledgeDelete("${op.input.source}")`,
  (op) => op.output?.deleted ? `Deleted ${op.output.deleted} entr${op.output.deleted !== 1 ? 'ies' : 'y'}` : null
);
