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
        borderColor="border-yellow-400/30"
        bgColor="bg-yellow-400/5"
        labelColor="text-yellow-400"
      />
    );
  };
}

export const assistant_switch = createRenderer(
  (op) => `AssistantSwitch("${op.input.name}")`,
  (op) => op.output ? `Switched to assistant: ${op.input.name}` : null
);

export const assistant_update = createRenderer(
  (op) => `AssistantUpdate("${op.input.name}")`,
  (op) => op.output ? `Updated assistant: ${op.input.name}` : null
);

export const assistant_add = createRenderer(
  (op) => `AssistantAdd("${op.input.name}")`,
  (op) => op.output ? `Created assistant: ${op.input.name}` : null
);

export const memory_list = createRenderer(
  (op) => 'MemoryList()',
  (op) => {
    if (op.output) {
      const count = op.output.memories.length;
      return `${count} memor${count !== 1 ? 'ies' : 'y'}`;
    }
    return null;
  }
);

export const memory_update = createRenderer(
  (op) => `MemoryUpdate("${abbreviate(op.input.content, 30)}")`,
  (op) => op.output ? `Added: "${abbreviate(op.input.content, 50)}"` : null
);
