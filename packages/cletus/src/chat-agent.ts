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

- **planner**: Todo management, task planning, breaking down complex requests
- **librarian**: Knowledge search, semantic search, managing memories and embeddings
- **clerk**: File operations (search, read, create, edit, delete files and directories)
- **secretary**: User memory, assistant personas, switching assistants
- **architect**: Type definitions, creating/modifying data schemas
- **artist**: Image generation, editing, analysis, and search
- **dba**: Data operations (CRUD, queries, aggregations on custom data types)

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
          return await planner.run({ request: params.request }, ctx);
        case 'librarian':
          return await librarian.run({ request: params.request }, ctx);
        case 'clerk':
          return await clerk.run({ request: params.request }, ctx);
        case 'secretary':
          return await secretary.run({ request: params.request }, ctx);
        case 'architect':
          return await architect.run({ request: params.request }, ctx);
        case 'artist':
          return await artist.run({ request: params.request }, ctx);
        case 'dba':
          return await dba.run({ request: params.request }, ctx);
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

{{#if user}}
User: {{user.name}}{{#if user.pronouns}} ({{user.pronouns}}){{/if}}
{{#if user.memory.length}}

User Memories:
{{#each user.memory}}
- {{this.text}}
{{/each}}
{{/if}}
{{/if}}

{{#if assistant}}
Assistant Persona: {{assistant.name}}
{{assistant.prompt}}
{{/if}}

{{#if currentTodo}}
Current Todo: {{currentTodo.name}}
{{/if}}

{{#if todos.length}}
Active Todos:
{{#each todos}}
{{@index}}. [{{#if this.done}}✓{{else}} {{/if}}] {{this.name}}
{{/each}}
{{/if}}

Chat Mode: {{mode}}
- none: All operations require user approval
- read: Read operations are automatic, others require approval
- create: Read & create operations are automatic, others require approval
- update: Read, create, & update operations are automatic, delete requires approval
- delete: All operations are automatic

{{#if types.length}}
Available Data Types:
{{#each types}}
- {{this.name}}: {{this.friendlyName}}{{#if this.description}} - {{this.description}}{{/if}}
{{/each}}
{{/if}}

You have access to specialized agents via the 'delegate' tool. When the user asks for something, determine which agent can best handle it and delegate the work. You can delegate to multiple agents if needed.`,
    tools: [routeTool],
    toolExecution: 'parallel',
    schema: false,
    input: (input: {}, ctx) => {
      const config = ctx.config.getData();
      const chat = ctx.chat;

      return {
        user: config.user,
        assistant: config.assistants.find((a) => a.name === chat?.assistant),
        mode: chat?.mode || 'none',
        currentTodo: chat?.todos.find((t) => !t.done),
        todos: chat?.todos || [],
        types: config.types,
      };
    },
  });

  return chatPrompt;
}
