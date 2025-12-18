import { abbreviate, pluralize } from "../common";
import { renderOperation } from "../helpers/render";
import type { TodoItem } from "../schemas";
import { operationOf } from "./types";

export const todos_clear = operationOf<{}, { cleared: boolean }>({
  mode: 'delete',
  signature: 'todos_clear()',
  status: () => 'Clearing all todos',
  analyze: async ({ input }, { chat, config }) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    const todoCount = chatObject?.todos.length || 0;
    const doneCount = chatObject?.todos.filter((t) => t.done).length || 0;
    const undoneCount = todoCount - doneCount;

    return {
      analysis: `This will clear ${todoCount} todos (${doneCount} done, ${undoneCount} not done).`,
      doable: !!chatObject,
    };
  },
  do: async ({ input }, { chat, config }) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    if (chatObject) {
      await config.updateChat(chatObject.id, { todos: [] });
    }

    return { cleared: true };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    'TodosClear()',
    (op) => {
      if (op.output) {
        return 'All todos cleared';
      }
      return null;
    },
    showInput, showOutput
  ),
});

export const todos_list = operationOf<{}, { todos: TodoItem[] }>({
  mode: 'local',
  signature: 'todos_list()',
  status: () => 'Listing todos',
  analyze: async ({ input }, { chat, config }) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    const todoCount = chatObject?.todos.length || 0;
    return {
      analysis: `This will list ${todoCount} todos.`,
      doable: !!chatObject,
    };
  },
  do: async ({ input }, { chat, config }) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    return { todos: chatObject?.todos || [] };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    'TodosList()',
    (op) => {
      if (op.output) {
        return pluralize(op.output.todos.length, 'todo');
      }
      return null;
    }
  , showInput, showOutput),
});

export const todos_add = operationOf<{ name: string }, { id: string; name: string }>({
  mode: 'create',
  signature: 'todos_add(name: string)',
  status: (input) => `Adding todo: ${abbreviate(input.name, 40)}`,
  analyze: async ({ input }, { chat, config }) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    return {
      analysis: `This will add a new todo: "${input.name}"`,
      doable: !!chatObject,
    };
  },
  do: async ({ input }, { chat, config }) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    if (!chatObject) {
      throw new Error('Chat not found');
    }

    const id = Math.random().toString(36).substring(7);
    const newTodo: TodoItem = { id, name: input.name, done: false };
    const newTodos = [...chatObject.todos, newTodo];

    await config.updateChat(chatObject.id, { todos: newTodos });

    return { id, name: input.name };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `TodosAdd("${abbreviate(op.input.name, 30)}")`,
    (op) => {
      if (op.output) {
        return `Added: "${op.output.name}"`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

export const todos_done = operationOf<{ id: string }, { id: string; done: boolean }, {}, { todoName: string }>({
  mode: 'update',
  signature: 'todos_done(id: string)',
  status: () => 'Marking todo as done',
  analyze: async ({ input }, { chat, config }) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    const todo = chatObject?.todos.find((t) => t.id === input.id);

    if (!todo) {
      return {
        analysis: `This would fail - todo with id "${input.id}" not found.`,
        doable: false,
      };
    }

    return {
      analysis: `This will mark todo "${todo.name}" as done.`,
      doable: true,
      cache: { todoName: todo.name },
    };
  },
  do: async ({ input }, { chat, config }) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    if (!chatObject) {
      throw new Error('Chat not found');
    }

    const todo = chatObject.todos.find((t) => t.id === input.id);
    if (!todo) {
      throw new Error(`Todo not found: ${input.id}`);
    }

    const newTodos = chatObject.todos.map((t) =>
      t.id === input.id ? { ...t, done: true } : t
    );

    await config.updateChat(chatObject.id, { todos: newTodos });

    return { id: input.id, done: true };
  },
  render: (op, ai, showInput, showOutput) => {
    const todoName = op.cache?.todoName || op.input.id;
    return renderOperation(
      op,
      `TodosDone("${abbreviate(todoName, 64)}")`,
      (op) => {
        if (op.output) {
          return 'Marked todo as done';
        }
        return null;
      },
      showInput, showOutput
    );
  },
});

export const todos_get = operationOf<{ id: string }, { todo: TodoItem | null }, {}, { todoName: string }>({
  mode: 'local',
  signature: 'todos_get(id: string)',
  status: () => 'Getting todo details',
  analyze: async ({ input }, { chat, config }) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    const todo = chatObject?.todos.find((t) => t.id === input.id);
    return {
      analysis: `This will get details for todo with id "${input.id}"`,
      doable: !!chatObject,
      cache: todo ? { todoName: todo.name } : undefined,
    };
  },
  do: async ({ input }, { chat, config }) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    const todo = chatObject?.todos.find((t) => t.id === input.id);
    return { todo: todo || null };
  },
  render: (op, ai, showInput, showOutput) => {
    const todoName = op.cache?.todoName || op.input.id;
    return renderOperation(
      op,
      `TodosGet("${abbreviate(todoName, 64)}")`,
      (op) => {
        if (op.output) {
          return op.output.todo ? `Found: "${abbreviate(op.output.todo.name, 64)}"` : 'Todo not found';
        }
        return null;
      },
      showInput, showOutput
    );
  },
});

export const todos_remove = operationOf<{ id: string }, { id: string; removed: boolean }, {}, { todoName: string }>({
  mode: 'delete',
  signature: 'todos_remove(id: string)',
  status: () => 'Removing todo',
  analyze: async ({ input }, { chat, config }) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    const todo = chatObject?.todos.find((t) => t.id === input.id);

    if (!todo) {
      return {
        analysis: `This would fail - todo with id "${input.id}" not found.`,
        doable: false,
      };
    }

    return {
      analysis: `This will remove todo "${todo.name}"`,
      doable: true,
      cache: { todoName: todo.name },
    };
  },
  do: async ({ input }, { chat, config }) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    if (!chatObject) {
      throw new Error('Chat not found');
    }

    const newTodos = chatObject.todos.filter((t) => t.id !== input.id);
    await config.updateChat(chatObject.id, { todos: newTodos });

    return { id: input.id, removed: true };
  },
  render: (op, ai, showInput, showOutput) => {
    const todoName = op.cache?.todoName || op.input.id;
    return renderOperation(
      op,
      `TodosRemove("${abbreviate(todoName, 64)}")`,
      (op) => {
        if (op.output) {
          return 'Removed todo';
        }
        return null;
      },
      showInput, showOutput
    );
  },
});

export const todos_replace = operationOf<{ todos: TodoItem[] }, { count: number }>({
  mode: 'update',
  signature: 'todos_replace(todos)',
  status: (input) => `Replacing with ${input.todos.length} todos`,
  analyze: async ({ input }, { chat, config }) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    const currentCount = chatObject?.todos.length || 0;
    const newCount = input.todos.length;

    return {
      analysis: `This will replace ${currentCount} todos with ${newCount} new todos.`,
      doable: !!chatObject,
    };
  },
  do: async ({ input }, { chat, config }) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    if (!chatObject) {
      throw new Error('Chat not found');
    }

    await config.updateChat(chatObject.id, { todos: input.todos });

    return { count: input.todos.length };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `TodosReplace(${op.input.todos.length} todos)`,
    (op) => {
      if (op.output) {
        return `Replaced with ${op.output.count} todo${op.output.count !== 1 ? 's' : ''}`;
      }
      return null;
    },
    showInput, showOutput
  ),
});