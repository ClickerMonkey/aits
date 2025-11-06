import { z } from 'zod';
import type { CletusAI } from '../ai.js';
import { createSubAgents } from './sub-agents.js';

/**
 * Create the main chat agent that routes to sub-agents
 */
export function createChatAgent(ai: CletusAI) {
  // Create all sub-agents
  const subAgents = createSubAgents(ai);

  // Get the data types for the dba agent
  const types = ai.config.defaultContext?.config?.getData().types || [];
  const typeEnum = z.enum(types.map(t => t.name) as [string, ...string[]]);

  // Create the routing tool that decides which sub-agent to use
  const routeTool = ai.tool({
    name: 'delegate',
    description: 'Delegate work to a specialized sub-agent',
    instructions: `Use this tool to route requests to specialized agents:

- **planner**: Todo management, breaking down complex requests from the user for Cletus to perform. Todos are primarily for Cletus itself to manage its own work and not the user.
- **librarian**: Knowledge search, semantic search, managing knowledge
- **clerk**: File operations (text search, semantic search, read, create, edit, delete, move, copy, info, summarization, indexing)
- **secretary**: User memory, assistant personas, switching assistants
- **architect**: Type definitions, creating/modifying data schemas
- **artist**: Image generation, editing, analysis, and search
- **dba**: Data operations (create, update, delete, select, update many, delete many, aggregate) - when using this agent, you MUST specify the type of data to operate on using the 'type' parameter

Choose the appropriate agent based on what the user needs to do.`,
    schema: z.object({
      agent: z.enum(['planner', 'librarian', 'clerk', 'secretary', 'architect', 'artist', 'dba']).describe('Which sub-agent to use'),
      typeName: typeEnum.optional().describe('The type of data to operate on (required for dba agent)'),
    }),
    refs: subAgents,
    call: ({ agent, typeName }, [planner, librarian, clerk, secretary, architect, artist, dba], ctx) => {
      ctx.log('Routing to sub-agent: ' + agent);

      if (agent === 'dba') {
        const type = typeName ? types.find(t => t.name === typeName) : undefined;
        if (!type) {
          throw new Error('The dba agent requires a type parameter to specify the data type to operate on. given: ' + (dbaTypeName || '(null))'));
        }
        
        return dba.get({}, 'tools', { ...ctx, type });
      } else {
        const subAgent = {
          planner,
          librarian,
          clerk,
          secretary,
          architect,
          artist,
        }[agent];

        if (!subAgent) {
          throw new Error(`Invalid sub-agent: ${agent || '(null)'}`);
        }

        return subAgent.get({}, 'tools', ctx);
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

You have access to specialized agents via the 'delegate' tool. When the user asks for something, determine which agent can best handle it and delegate the work. You can delegate to multiple agents if needed.

You MUST use the 'delegate' tool to perform any actions; do not attempt to do anything yourself.

If you don't find the information you need, try to get it from another agent.`,
    tools: [routeTool],
    toolsMax: 3,
    metadata: {
      weights: {
        speed: 0.7,
        accuracy: 0.3,
      },
    },
    input: (input: {}, ctx) => ({ userPrompt: ctx.userPrompt }),
  });

  return chatPrompt;
}
