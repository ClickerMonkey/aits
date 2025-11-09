import { z } from 'zod';
import type { CletusAI } from '../ai';
import { createSubAgents } from './sub-agents';
import { ComponentInput } from '@aits/core';

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

- **planner**: The user will make requests and when a request takes multiple steps to complete, you should use the planner agent to create and manage todos for Cletus to perform. These are only to keep track of Cletus's own work and should not be presented to the user unless explicitly asked for.
- **librarian**: Knowledge search, semantic search, managing knowledge. Knowledge is built from custom data, indexed files, and explicitly created by the user. It's text that can be retrieved with semantic search.
- **clerk**: File operations (text search, semantic search, read, create, edit, delete, move, copy, info, summarization, indexing)
- **secretary**: User memory, assistant personas, switching assistants
- **architect**: Type definitions, creating/modifying data schemas
- **artist**: Image generation, editing, analysis, and search
- **dba**: Data operations (create, update, delete, select, update many, delete many, aggregate) - when using this agent, you MUST specify the type of data to operate on using the 'type' parameter

Choose the appropriate agent based on what the user wants done.

<rules>
- If the user requests an action around data types defined that can be accomplished with a database query like tool call - use the 'dba'.
- If the user requests anything related to images, use the 'artist' agent.
- If the user requests anything that would involve making multiple steps or tracking progress over time, use the 'planner' agent.
- If the user requests anything related to file operations, use the 'clerk' agent.
- If the user requests anything to a perceived data type that they don't have yet - confirm they want to create a new type with the 'architect' agent.
- If the user explicitly asks to memories, or assistants - use the 'secretary' agent.
- If the user says something and it sounds important to remember for all future conversations, use the 'secretary' agent to add a memory.
- Todos are exlusively for Cletus's internal management of user requests. They are only referred to as todos - anything else should assumed to be a separate data type.
</rules>
`,
    schema: z.object({
      agent: z.enum(['planner', 'librarian', 'clerk', 'secretary', 'architect', 'artist', 'dba']).describe('Which sub-agent to use'),
      typeName: typeEnum.nullable().describe('The type of data to operate on (required for dba agent)'),
    }),
    refs: subAgents,
    call: ({ agent, typeName }, [planner, librarian, clerk, secretary, architect, artist, dba], ctx) => {
      ctx.log('Routing to sub-agent: ' + agent);

      if (agent === 'dba') {
        const type = typeName ? types.find(t => t.name === typeName) : undefined;
        if (!type) {
          throw new Error('The dba agent requires a type parameter to specify the data type to operate on. given: ' + (typeName || '(null))'));
        }
        
        return dba.get('tools', {}, { ...ctx, type });
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

        return subAgent.get('tools', {}, ctx);
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

Only do explicitly what the user asks you to do. If the user request is unclear, ask for clarification.

If you don't find the information you need, try to get it from another agent.`,
    tools: [routeTool],
    toolsMax: 3,
    config: {
      toolChoice: 'required',
    },
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
