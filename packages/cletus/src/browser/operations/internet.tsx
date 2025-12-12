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
      <div className="mb-3 border border-neon-green/30 rounded-lg p-3 bg-neon-green/5">
        <div className="flex items-center gap-2 mb-2">
          <span className={cn('text-lg', statusColor)}>●</span>
          <span className="font-mono text-sm text-neon-green">{getLabel(operation)}</span>
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

export const web_search = createRenderer(
  (op) => `WebSearch("${op.input.query}")`,
  (op) => op.output?.results?.length ? `Found ${op.output.results.length} result${op.output.results.length !== 1 ? 's' : ''}` : null
);

export const web_get_page = createRenderer(
  (op) => `WebGet("${op.input.url}")`,
  (op) => op.output?.content ? `Retrieved ${op.output.content.length} characters` : null
);

export const web_api_call = createRenderer(
  (op) => `API(${op.input.method} "${op.input.url}")`,
  (op) => op.output?.status ? `Status ${op.output.status}` : null
);

export const web_download = createRenderer(
  (op) => `Download("${op.input.url}")`,
  (op) => op.output?.path ? `Saved to ${op.output.path}` : null
);
