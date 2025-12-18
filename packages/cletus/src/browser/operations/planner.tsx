import { Operation } from '../../schemas';
import { abbreviate, pluralize } from '../../shared';
import { createRenderer } from './render';

const renderer = createRenderer({
  borderColor: "border-neon-purple/30",
  bgColor: "bg-neon-purple/5",
  labelColor: "text-neon-purple",
});

// Helper to extract todo name from analysis
function getTodoName(op: Operation): string | null {
  if (!op.analysis) return null;
  // Analysis format: 'This will mark todo "name" as done.'
  const match = op.analysis.match(/todo "([^"]+)"/);
  return match ? match[1] : null;
}

export const todos_list = renderer<'todos_list'>(
  (op) => 'TodosList()',
  (op) => {
    if (op.output) {
      return pluralize(op.output.todos.length, 'todo');
    }
    return null;
  }
);

export const todos_add = renderer<'todos_add'>(
  (op) => `TodosAdd("${abbreviate(op.input.name, 64)}")`,
  (op) => {
    if (op.output) {
      return `Added: "${op.output.name}"`;
    }
    return null;
  }
);

export const todos_done = renderer<'todos_done'>(
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

export const todos_get = renderer<'todos_get'>(
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

export const todos_remove = renderer<'todos_remove'>(
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

export const todos_replace = renderer<'todos_replace'>(
  (op) => `TodosReplace(${op.input.todos.length} todos)`,
  (op) => {
    if (op.output) {
      return `Replaced with ${op.output.count} todo${op.output.count !== 1 ? 's' : ''}`;
    }
    return null;
  }
);

export const todos_clear = renderer<'todos_clear'>(
  (op) => 'TodosClear()',
  (op) => {
    if (op.output) {
      return 'All todos cleared';
    }
    return null;
  }
);
