import { z } from 'zod';
import type { CletusAI } from '../ai';
import { formatName } from '../common';

/**
 * Create utility tools for Cletus operations
 */
export function createUtilityTools(ai: CletusAI) {
  const getOperationOutput = ai.tool({
    name: 'getOperationOutput',
    description: 'Retrieves the full output of a truncated operation message',
    instructions: `Use this when you see a message indicating that operation output was truncated.`,
    schema: z.object({
      id: z.number().describe('The message ID provided in the truncation notice'),
      operation: z.number().describe('The operation index within the message provided in the truncation notice'),
    }),
    call: async ({ id: created, operation: operationIndex }, _, { chatData, chatStatus }) => {
      // Verify chat is in context
      if (!chatData) {
        throw new Error('No active chat context available');
      }
      
      // Find the message with matching created timestamp
      const messages = chatData.getMessages();
      const message = messages.find((m) => m.created === created);
      
      if (!message) {
        throw new Error(`No message found with ID: ${created}`);
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
      
      // Update status after operation completes
      chatStatus(`Analyzing ${formatName(operation.type)} full results...`);
      
      return operation.message;
    },
  });

  return [
    getOperationOutput,
  ] as [
    typeof getOperationOutput,
  ];
}
