import { z } from 'zod';
import type { CletusAI } from './ai.js';
import { createSubAgents } from './agents/sub-agents.js';
import { ChatMode } from './schemas.js';

/**
 * Create the main chat agent that routes to sub-agents
 */
export function createChatAgent(ai: CletusAI) {
  // Create all sub-agents
  const subAgents = createSubAgents(ai);

  // Create the routing tool that decides which sub-agent to use
  const routeTool = ai.tool({
    name: 'delegate',
    description: 'Delegate work to a specialized sub-agent',
    instructions: `Use this tool to route requests to specialized agents:

- **planner**: Todo management, breaking down complex requests
- **librarian**: Knowledge search, semantic search, managing knowledge
- **clerk**: File operations (text search, semantic search, read, create, edit, delete, move, copy, info, summarization, indexing)
- **secretary**: User memory, assistant personas, switching assistants
- **architect**: Type definitions, creating/modifying data schemas
- **artist**: Image generation, editing, analysis, and search
- **dba**: Data operations (create, update, delete, select, update many, delete many, aggregate)

Choose the appropriate agent based on what the user needs to do.`,
    schema: z.object({
      agent: z.enum(['planner', 'librarian', 'clerk', 'secretary', 'architect', 'artist', 'dba']).describe('Which sub-agent to use'),
      request: z.string().describe('The request to send to the sub-agent'),
    }),
    refs: [
      subAgents.planner,
      subAgents.librarian,
      subAgents.clerk,
      subAgents.secretary,
      subAgents.architect,
      subAgents.artist,
      subAgents.dba,
    ],
    call: async (params, [planner, librarian, clerk, secretary, architect, artist, dba], ctx) => {
      // Route to the appropriate sub-agent
      switch (params.agent) {
        case 'planner':
          return planner.run({ request: params.request }, ctx);
        case 'librarian':
          return librarian.run({ request: params.request }, ctx);
        case 'clerk':
          return clerk.run({ request: params.request }, ctx);
        case 'secretary':
          return secretary.run({ request: params.request }, ctx);
        case 'architect':
          return architect.run({ request: params.request }, ctx);
        case 'artist':
          return artist.run({ request: params.request }, ctx);
        case 'dba':
          return dba.run({ request: params.request }, ctx);
        default:
          throw new Error(`Unknown agent: ${params.agent}`);
      }
    },
  });

  // Create the main chat prompt with just the routing tool
  const chatPrompt = ai.prompt({
    name: 'cletus_chat',
    description: 'Main Cletus chat interface',
    content: `You are Cletus, a powerful CLI assistant that helps users manage tasks, files, data, and knowledge.

<userInformation>
{{userPrompt}}
</userInformation>

You have access to specialized agents via the 'delegate' tool. When the user asks for something, determine which agent can best handle it and delegate the work. You can delegate to multiple agents if needed.`,
    tools: [routeTool],
    toolExecution: 'parallel',
    schema: false,
    input: (input: {}, ctx) => ({ userPrompt: ctx.userPrompt }),
  });

  return chatPrompt;
}
