import { CletusCoreContext } from "../ai";
import { operationOf } from "./types";
import type { TodoItem } from "../schemas";

export const todos_clear = operationOf<{}, { cleared: boolean }>({
  mode: 'update',
  analyze: async (input, { chat, config }: CletusCoreContext) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    const todoCount = chatObject?.todos.length || 0;
    const doneCount = chatObject?.todos.filter((t) => t.done).length || 0;
    const undoneCount = todoCount - doneCount;

    return {
      analysis: `This will clear ${todoCount} todos (${doneCount} done, ${undoneCount} not done).`,
      doable: !!chatObject,
    };
  },
  do: async (input, { chat, config }: CletusCoreContext) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    if (chatObject) {
      await config.updateChat(chatObject.id, { todos: [] });
    }

    return { cleared: true };
  },
});

export const todos_list = operationOf<{}, { todos: TodoItem[] }>({
  mode: 'local',
  analyze: async (input, { chat, config }: CletusCoreContext) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    const todoCount = chatObject?.todos.length || 0;
    return {
      analysis: `This will list ${todoCount} todos.`,
      doable: !!chatObject,
    };
  },
  do: async (input, { chat, config }: CletusCoreContext) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    return { todos: chatObject?.todos || [] };
  },
});

export const todos_add = operationOf<{ name: string }, { id: string; name: string }>({
  mode: 'create',
  analyze: async (input, { chat, config }: CletusCoreContext) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    return {
      analysis: `This will add a new todo: "${input.name}"`,
      doable: !!chatObject,
    };
  },
  do: async (input, { chat, config }: CletusCoreContext) => {
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
});

export const todos_done = operationOf<{ id: string }, { id: string; done: boolean }>({
  mode: 'update',
  analyze: async (input, { chat, config }: CletusCoreContext) => {
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
    };
  },
  do: async (input, { chat, config }: CletusCoreContext) => {
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
});

export const todos_get = operationOf<{ id: string }, { todo: TodoItem | null }>({
  mode: 'local',
  analyze: async (input, { chat, config }: CletusCoreContext) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    return {
      analysis: `This will get details for todo with id "${input.id}"`,
      doable: !!chatObject,
    };
  },
  do: async (input, { chat, config }: CletusCoreContext) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    const todo = chatObject?.todos.find((t) => t.id === input.id);
    return { todo: todo || null };
  },
});

export const todos_remove = operationOf<{ id: string }, { id: string; removed: boolean }>({
  mode: 'delete',
  analyze: async (input, { chat, config }: CletusCoreContext) => {
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
    };
  },
  do: async (input, { chat, config }: CletusCoreContext) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    if (!chatObject) {
      throw new Error('Chat not found');
    }

    const newTodos = chatObject.todos.filter((t) => t.id !== input.id);
    await config.updateChat(chatObject.id, { todos: newTodos });

    return { id: input.id, removed: true };
  },
});

export const todos_replace = operationOf<{ todos: TodoItem[] }, { count: number }>({
  mode: 'update',
  analyze: async (input, { chat, config }: CletusCoreContext) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    const currentCount = chatObject?.todos.length || 0;
    const newCount = input.todos.length;

    return {
      analysis: `This will replace ${currentCount} todos with ${newCount} new todos.`,
      doable: !!chatObject,
    };
  },
  do: async (input, { chat, config }: CletusCoreContext) => {
    const chatObject = config.getChats().find((c) => c.id === chat?.id);
    if (!chatObject) {
      throw new Error('Chat not found');
    }

    await config.updateChat(chatObject.id, { todos: input.todos });

    return { count: input.todos.length };
  },
});