import { z } from 'zod';
import type { CletusAI } from '../ai.js';
import type { Operation } from '../schemas.js';

/**
 * Create secretary tools for assistant and memory management
 * Tools return operations that will be executed based on chat mode
 */
export function createSecretaryTools(ai: CletusAI) {
  const assistantSwitch = ai.tool({
    name: 'assistant_switch',
    description: 'Switch to a different assistant persona',
    instructions: 'Use this to change the current chat assistant. The assistant persona affects how the AI responds.',
    schema: z.object({
      name: z.string().describe('Assistant name'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'assistant_switch',
        input: {
          name: params.name,
        },
        kind: 'update',
      };
    },
  });

  const assistantUpdate = ai.tool({
    name: 'assistant_update',
    description: 'Update an assistant persona prompt',
    instructions: 'Use this to modify an existing assistant\'s system prompt.',
    schema: z.object({
      name: z.string().describe('Assistant name'),
      prompt: z.string().describe('New system prompt'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'assistant_update',
        input: {
          name: params.name,
          prompt: params.prompt,
        },
        kind: 'update',
      };
    },
  });

  const assistantAdd = ai.tool({
    name: 'assistant_add',
    description: 'Create a new assistant persona',
    instructions: 'Use this to create a new assistant with a custom system prompt. The assistant will be available for future chats.',
    schema: z.object({
      name: z.string().describe('Assistant name'),
      prompt: z.string().describe('System prompt for the assistant'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'assistant_add',
        input: {
          name: params.name,
          prompt: params.prompt,
        },
        kind: 'create',
      };
    },
  });

  const memoryList = ai.tool({
    name: 'memory_list',
    description: 'List all user memories',
    instructions: 'Use this to see what the user has asked to remember.',
    schema: z.object({}),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'memory_list',
        input: {},
        kind: 'read',
      };
    },
  });

  const memoryUpdate = ai.tool({
    name: 'memory_update',
    description: 'Add or update user memory',
    instructions: 'Use this to store important information about the user. This will integrate with existing memories or add a new one.',
    schema: z.object({
      content: z.string().describe('Memory content to add or update'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'memory_update',
        input: {
          content: params.content,
        },
        kind: 'create',
      };
    },
  });

  return [
    assistantSwitch,
    assistantUpdate,
    assistantAdd,
    memoryList,
    memoryUpdate,
  ] as const;
}
