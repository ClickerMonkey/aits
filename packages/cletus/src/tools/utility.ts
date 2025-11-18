import { z } from 'zod';
import type { CletusAI } from '../ai';

/**
 * Create utility tools for Cletus operations
 */
export function createUtilityTools(ai: CletusAI) {
  const getOperationOutput = ai.tool({
    name: 'getOperationOutput',
    description: 'Retrieves the full output of a truncated operation message',
    instructions: `Use this when you see a message indicating that operation output was truncated.
The key format is "{messageTimestamp}-{operationIndex}" as provided in the truncation message.

Example: Retrieve full output for operation 12345678-0:
{ "key": "12345678-0" }`,
    schema: z.object({
      key: z.string().describe('The operation output key in format "{messageTimestamp}-{operationIndex}"'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'get_operation_output', input }, ctx),
  });

  return [
    getOperationOutput,
  ] as [
    typeof getOperationOutput,
  ];
}
