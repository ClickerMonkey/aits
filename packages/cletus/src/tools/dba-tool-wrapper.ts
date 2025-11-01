import { z } from 'zod';
import type { CletusAI } from '../ai.js';
import type { Operation } from '../schemas.js';
import { createDBAAgent } from './dba-tools.js';

/**
 * Create a tool that wraps the DBA agent
 * This allows the main chat to call the DBA agent as a tool
 */
export function createDBATool(ai: CletusAI) {
  const dbaAgent = createDBAAgent(ai);

  const dbaTool = ai.tool({
    name: 'dba',
    description: 'Perform data operations on custom data types',
    instructions: `Use this tool when you need to work with custom data types. The DBA will:
1. Identify which data type you're working with
2. Create type-specific tools with proper schemas
3. Execute the requested data operation

This tool handles all CRUD operations, queries with complex filters, bulk updates, and aggregations.`,
    schema: z.object({
      request: z.string().describe('Description of the data operation you want to perform'),
    }),
    refs: [dbaAgent],
    call: async (params, [dba], ctx): Promise<Operation> => {
      // The DBA agent will handle the two-stage process internally
      const result = await dba.run({ request: params.request }, ctx);

      // Return a marker operation - the actual operations will come from nested tools
      return {
        type: 'dba_operation',
        input: {
          request: params.request,
          result,
        },
        kind: 'read', // Will be determined by actual nested operations
      };
    },
  });

  return dbaTool;
}
