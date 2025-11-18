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
    call: async (input, _, ctx) => {
      // Parse the key to extract created timestamp and operation index
      const parts = input.key.split('-');
      if (parts.length !== 2) {
        throw new Error(`Invalid key format. Expected "{messageTimestamp}-{operationIndex}", got: ${input.key}`);
      }
      
      const created = parseFloat(parts[0]);
      const operationIndex = parseInt(parts[1], 10);
      
      if (isNaN(created) || isNaN(operationIndex)) {
        throw new Error(`Invalid key format. Could not parse timestamp or operation index from: ${input.key}`);
      }
      
      // Verify chat is in context
      if (!ctx.chatData) {
        throw new Error('No active chat context available');
      }
      
      // Find the message with matching created timestamp
      const messages = ctx.chatData.getMessages();
      const message = messages.find((m) => m.created === created);
      
      if (!message) {
        throw new Error(`No message found with timestamp: ${created}`);
      }
      
      // Get the operation at the given index
      if (!message.operations || operationIndex >= message.operations.length) {
        throw new Error(`No operation found at index ${operationIndex} for message ${created}`);
      }
      
      const operation = message.operations[operationIndex];
      
      // Return the full operation message
      if (!operation.message) {
        throw new Error(`Operation at index ${operationIndex} has no message`);
      }
      
      return operation.message;
    },
  });

  return [
    getOperationOutput,
  ] as [
    typeof getOperationOutput,
  ];
}
