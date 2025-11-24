import { z } from 'zod';
import { globalToolProperties, type CletusAI } from '../ai';

/**
 * Create librarian tools for knowledge management
 */
export function createLibrarianTools(ai: CletusAI) {
  const knowledgeSearch = ai.tool({
    name: 'knowledge_search',
    description: 'Search knowledge base by semantic similarity',
    instructions: `Use this to find relevant information from the knowledge base using semantic search. Provide a query and optionally filter by source prefix (e.g., "user", "file@path:", "task:id").

Example: Search for user preferences:
{ "query": "user's preferred programming languages", "limit": 5, "sourcePrefix": "user" }`,
    schema: z.object({
      query: z.string().describe('Search query text'),
      limit: z.number().optional().describe('Maximum results (default: 10)'),
      sourcePrefix: z.string().optional().describe('Filter by source prefix (e.g., "user", "task:", "file@{path}:")'),
      ...globalToolProperties,
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'knowledge_search', input }, ctx),
  });

  const knowledgeSources = ai.tool({
    name: 'knowledge_sources',
    description: 'List all unique source prefixes in knowledge base',
    instructions: `Use this to see what types of knowledge are available. Sources are prefixed like "user", "task:", "file@{path}:".

Example: Simply call with no parameters:
{}`,
    schema: z.object({
      ...globalToolProperties,
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'knowledge_sources', input }, ctx),
  });

  const knowledgeAdd = ai.tool({
    name: 'knowledge_add',
    description: 'Add user memory to knowledge base',
    instructions: `Use this to store important information the user wants to remember. This will be embedded and made searchable via semantic search.

Example: Store a project detail:
{ "text": "The authentication service uses JWT tokens with a 24-hour expiration" }`,
    schema: z.object({
      text: z.string().describe('The memory text to add'),
      ...globalToolProperties,
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'knowledge_add', input }, ctx),
  });

  const knowledgeDelete = ai.tool({
    name: 'knowledge_delete',
    description: 'Delete all knowledge entries matching a source pattern',
    instructions: `Use this to remove knowledge entries. Provide a regex pattern to match sources and optionally specify case sensitivity. Be careful as this is permanent.

Example: Delete all knowledge from a specific file (exact match):
{ "sourcePattern": "^file@docs/old-guide\\.md:", "caseSensitive": true }

Example: Delete all knowledge from task 123 (case insensitive):
{ "sourcePattern": "task:123", "caseSensitive": false }

Example: Delete all user knowledge:
{ "sourcePattern": "^user:", "caseSensitive": true }`,
    schema: z.object({
      sourcePattern: z.string().describe('Regex pattern to match source strings (e.g., "^task:123", "file@.*\\.md:", "^user:")'),
      caseSensitive: z.boolean().optional().default(true).describe('Whether pattern matching is case-sensitive (default: true)'),
      ...globalToolProperties,
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'knowledge_delete', input }, ctx),
  });

  return [
    knowledgeSearch,
    knowledgeSources,
    knowledgeAdd,
    knowledgeDelete,
  ] as [
    typeof knowledgeSearch,
    typeof knowledgeSources,
    typeof knowledgeAdd,
    typeof knowledgeDelete,
  ];
}
