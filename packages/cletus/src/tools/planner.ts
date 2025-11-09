import { z } from 'zod';
import type { CletusAI } from '../ai';

/**
 * Create planner tools for todo management
 */
export function createPlannerTools(ai: CletusAI) {
  const todosClear = ai.tool({
    name: 'todos_clear',
    description: 'Clears all todos from the current chat',
    instructions: 'Use this to clear all todos when starting fresh or when all tasks are complete.',
    schema: z.object({}),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'todos_clear', input }, ctx),
  });

  const todosList = ai.tool({
    name: 'todos_list',
    description: 'Lists all current todos',
    instructions: 'Use this to see what tasks are pending or completed.',
    schema: z.object({}),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'todos_list', input }, ctx),
  });

  const todosAdd = ai.tool({
    name: 'todos_add',
    description: 'Adds a new todo to the list',
    instructions: 'Use this when breaking down a complex task into smaller steps. Provide a clear, concise name for the todo.',
    schema: z.object({
      name: z.string().describe('The todo name/description'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'todos_add', input }, ctx),
  });

  const todosDone = ai.tool({
    name: 'todos_done',
    description: 'Marks a todo as completed',
    instructions: 'Use this when a task has been successfully completed. Provide the todo ID.',
    schema: z.object({
      id: z.string().describe('The todo ID to mark as done'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'todos_done', input }, ctx),
  });

  const todosGet = ai.tool({
    name: 'todos_get',
    description: 'Gets details for a specific todo',
    instructions: 'Use this to check the status and details of a particular todo.',
    schema: z.object({
      id: z.string().describe('The todo ID'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'todos_get', input }, ctx),
  });

  const todosRemove = ai.tool({
    name: 'todos_remove',
    description: 'Removes a todo from the list',
    instructions: 'Use this to delete a todo that is no longer relevant or was added by mistake.',
    schema: z.object({
      id: z.string().describe('The todo ID to remove'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'todos_remove', input }, ctx),
  });

  const todosReplace = ai.tool({
    name: 'todos_replace',
    description: 'Replaces all todos with a new set',
    instructions: 'Use this to completely reorganize the todo list with a new plan. All existing todos will be replaced.',
    schema: z.object({
      todos: z.array(
        z.object({
          name: z.string(),
          done: z.boolean().optional(),
        })
      ).describe('Array of new todos'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({
      type: 'todos_replace',
      input: {
        todos: input.todos.map((t) => ({
          id: crypto.randomUUID(),
          name: t.name,
          done: t.done || false,
        }))
      }
    }, ctx),
  });

  return [
    todosClear,
    todosList,
    todosAdd,
    todosDone,
    todosGet,
    todosRemove,
    todosReplace,
  ] as [
    typeof todosClear,
    typeof todosList,
    typeof todosAdd,
    typeof todosDone,
    typeof todosGet,
    typeof todosRemove,
    typeof todosReplace,
  ];
}
