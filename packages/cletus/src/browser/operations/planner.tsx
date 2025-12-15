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
        borderColor="border-neon-purple/30"
        bgColor="bg-neon-purple/5"
        labelColor="text-neon-purple"
      />
    );
  };
}

// Helper to extract todo name from analysis
function getTodoName(op: Operation): string | null {
  if (!op.analysis) return null;
  // Analysis format: 'This will mark todo "name" as done.'
  const match = op.analysis.match(/todo "([^"]+)"/);
  return match ? match[1] : null;
}

export const todos_list = createRenderer(
  (op) => 'TodosList()',
  (op) => {
    if (op.output) {
      const count = op.output.todos.length;
      return `${count} todo${count !== 1 ? 's' : ''}`;
    }
    return null;
  }
);

export const todos_add = createRenderer(
  (op) => `TodosAdd("${abbreviate(op.input.name, 64)}")`,
  (op) => {
    if (op.output) {
      return `Added: "${op.output.name}"`;
    }
    return null;
  }
);

export const todos_done = createRenderer(
  (op) => {
    const todoName = getTodoName(op);
    return todoName ? `TodosDone("${abbreviate(todoName, 64)}")` : `TodosDone("${abbreviate(op.input.id, 64)}")`;
  },
  (op) => {
    if (op.output) {
      return 'Marked todo as done';
    }
    return null;
  }
);

export const todos_get = createRenderer(
  (op) => {
    const todoName = getTodoName(op);
    return todoName ? `TodosGet("${abbreviate(todoName, 64)}")` : `TodosGet("${abbreviate(op.input.id, 64)}")`;
  },
  (op) => {
    if (op.output) {
      return op.output.todo ? `Found: "${op.output.todo.name}"` : 'Todo not found';
    }
    return null;
  }
);

export const todos_remove = createRenderer(
  (op) => {
    const todoName = getTodoName(op);
    return todoName ? `TodosRemove("${abbreviate(todoName, 64)}")` : `TodosRemove("${abbreviate(op.input.id, 64)}")`;
  },
  (op) => {
    if (op.output) {
      return 'Removed todo';
    }
    return null;
  }
);

export const todos_replace = createRenderer(
  (op) => `TodosReplace(${op.input.todos.length} todos)`,
  (op) => {
    if (op.output) {
      return `Replaced with ${op.output.count} todo${op.output.count !== 1 ? 's' : ''}`;
    }
    return null;
  }
);

export const todos_clear = createRenderer(
  (op) => 'TodosClear()',
  (op) => {
    if (op.output) {
      return 'All todos cleared';
    }
    return null;
  }
);
