import React from 'react';
import { Operation } from '../../schemas';
import { abbreviate } from '../../shared';
import { BaseOperationDisplay } from './BaseOperationDisplay';
import { OperationRendererProps } from './types';

function createRenderer(getLabel: (op: Operation) => string, getSummary?: (op: Operation) => string | null) {
  return (props: OperationRendererProps) => {
    const { operation } = props;
    const label = getLabel(operation);
    const summary = operation.error || (getSummary ? getSummary(operation) : null) || operation.analysis;

    return (
      <BaseOperationDisplay
        {...props}
        label={label}
        summary={summary}
        borderColor="border-purple-400/30"
        bgColor="bg-purple-400/5"
        labelColor="text-purple-400"
      />
    );
  };
}

export const knowledge_search = createRenderer(
  (op) => `KnowledgeSearch("${abbreviate(op.input.query, 25)}")`,
  (op) => {
    if (op.output) {
      const count = op.output.results.length;
      return `Found ${count} result${count !== 1 ? 's' : ''}`;
    }
    return null;
  }
);

export const knowledge_sources = createRenderer(
  (op) => 'KnowledgeSources()',
  (op) => {
    if (op.output) {
      const count = op.output.sources.length;
      return `Listed ${count} source${count !== 1 ? 's' : ''}`;
    }
    return null;
  }
);

export const knowledge_add = createRenderer(
  (op) => `KnowledgeAdd("${abbreviate(op.input.text, 30)}")`,
  (op) => op.output?.added ? `Added: "${abbreviate(op.input.text, 50)}"` : null
);

export const knowledge_delete = createRenderer(
  (op) => `KnowledgeDelete("${op.input.sourcePattern}")`,
  (op) => {
    if (op.output) {
      return `Deleted ${op.output.deletedCount} entr${op.output.deletedCount !== 1 ? 'ies' : 'y'}`;
    }
    return null;
  }
);
