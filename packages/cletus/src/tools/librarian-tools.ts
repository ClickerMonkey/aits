import { z } from 'zod';
import type { CletusAI } from '../ai.js';
import type { Operation } from '../schemas.js';

/**
 * Create librarian tools for knowledge management
 * Tools return operations that will be executed based on chat mode
 */
export function createLibrarianTools(ai: CletusAI) {
  const knowledgeSearch = ai.tool({
    name: 'knowledge_search',
    description: 'Search knowledge base by semantic similarity',
    instructions: 'Use this to find relevant information from the knowledge base using semantic search. Provide a query and optionally filter by source prefix.',
    schema: z.object({
      query: z.string().describe('Search query text'),
      limit: z.number().optional().describe('Maximum results (default: 10)'),
      sourcePrefix: z.string().optional().describe('Filter by source prefix (e.g., "user", "task:", "file@{path}:")'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'knowledge_search',
        input: {
          query: params.query,
          limit: params.limit || 10,
          sourcePrefix: params.sourcePrefix,
        },
        kind: 'read',
      };
    },
  });

  const knowledgeSources = ai.tool({
    name: 'knowledge_sources',
    description: 'List all unique source prefixes in knowledge base',
    instructions: 'Use this to see what types of knowledge are available. Sources are prefixed like "user", "task:", "file@{path}".',
    schema: z.object({}),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'knowledge_sources',
        input: {},
        kind: 'read',
      };
    },
  });

  const knowledgeAdd = ai.tool({
    name: 'knowledge_add',
    description: 'Add user memory to knowledge base',
    instructions: 'Use this to store important information the user wants to remember. This will be embedded and searchable.',
    schema: z.object({
      text: z.string().describe('The memory text to add'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'knowledge_add',
        input: {
          text: params.text,
          source: 'user',
        },
        kind: 'create',
      };
    },
  });

  const knowledgeDelete = ai.tool({
    name: 'knowledge_delete',
    description: 'Delete all knowledge entries matching a source prefix',
    instructions: 'Use this to remove knowledge entries. Provide a source prefix to delete all matching entries (e.g., "task:123" or "file@{path}:summary").',
    schema: z.object({
      sourcePrefix: z.string().describe('Source prefix to delete (e.g., "task:123", "user")'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'knowledge_delete',
        input: {
          sourcePrefix: params.sourcePrefix,
        },
        kind: 'delete',
      };
    },
  });

  return [
    knowledgeSearch,
    knowledgeSources,
    knowledgeAdd,
    knowledgeDelete,
  ] as const;
}
