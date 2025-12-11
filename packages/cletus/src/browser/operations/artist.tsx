import React from 'react';
import { Operation } from '../../schemas';
import { getStatusInfo, getElapsedTime } from './render';
import { cn } from '../lib/utils';

interface OperationRendererProps {
  operation: Operation;
  showInput?: boolean;
  showOutput?: boolean;
}

function createRenderer(getLabel: (op: Operation) => string, getSummary?: (op: Operation) => React.ReactNode | null) {
  return ({ operation }: OperationRendererProps) => {
    const { color: statusColor, label: statusLabel } = getStatusInfo(operation.status);
    const elapsed = getElapsedTime(operation);
    const summary = getSummary ? getSummary(operation) : null;

    return (
      <div className="mb-3 border border-neon-pink/30 rounded-lg p-3 bg-neon-pink/5">
        <div className="flex items-center gap-2 mb-2">
          <span className={cn('text-lg', statusColor)}>●</span>
          <span className="font-mono text-sm text-neon-pink">{getLabel(operation)}</span>
          <span className="text-xs text-muted-foreground">[{statusLabel}]</span>
          {elapsed && <span className="text-xs text-muted-foreground">({elapsed})</span>}
        </div>
        {summary}
      </div>
    );
  };
}

export const image_generate = createRenderer(
  (op) => `ImageGen("${op.input.prompt?.substring(0, 30)}...")`,
  (op) => {
    if (operation.error) {
      return <div className="ml-6 text-sm text-red-400">→ {operation.error}</div>;
    }
    if (op.output?.url) {
      return (
        <div className="ml-6 mt-2">
          <img src={op.output.url} alt="Generated" className="max-w-sm rounded border border-neon-pink/30" />
        </div>
      );
    }
    return null;
  }
);

export const image_edit = createRenderer(
  (op) => `ImageEdit("${op.input.prompt?.substring(0, 30)}...")`,
  (op) => {
    if (operation.error) {
      return <div className="ml-6 text-sm text-red-400">→ {operation.error}</div>;
    }
    if (op.output?.url) {
      return (
        <div className="ml-6 mt-2">
          <img src={op.output.url} alt="Edited" className="max-w-sm rounded border border-neon-pink/30" />
        </div>
      );
    }
    return null;
  }
);

export const image_analyze = createRenderer(
  (op) => `ImageAnalyze("${op.input.path}")`,
  (op) => op.output?.analysis ? <div className="ml-6 text-sm text-muted-foreground">→ {op.output.analysis}</div> : null
);

export const image_describe = createRenderer(
  (op) => `ImageDescribe("${op.input.path}")`,
  (op) => op.output?.description ? <div className="ml-6 text-sm text-muted-foreground">→ {op.output.description}</div> : null
);

export const image_find = createRenderer(
  (op) => `ImageFind("${op.input.glob}")`,
  (op) => op.output?.count !== undefined ? <div className="ml-6 text-sm text-muted-foreground">→ Found {op.output.count} image{op.output.count !== 1 ? 's' : ''}</div> : null
);

export const image_attach = createRenderer(
  (op) => `ImageAttach("${op.input.path}")`,
  (op) => op.output ? <div className="ml-6 text-sm text-muted-foreground">→ Attached to context</div> : null
);
