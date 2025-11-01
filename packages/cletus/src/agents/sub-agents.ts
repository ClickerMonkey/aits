import type { CletusAI } from '../ai.js';
import { createPlannerTools } from '../tools/planner-tools.js';
import { createLibrarianTools } from '../tools/librarian-tools.js';
import { createClerkTools } from '../tools/clerk-tools.js';
import { createSecretaryTools } from '../tools/secretary-tools.js';
import { createArchitectTools } from '../tools/architect-tools.js';
import { createArtistTools } from '../tools/artist-tools.js';
import { createDBAAgent } from '../tools/dba-tools.js';

/**
 * Create all sub-agents, each with their own prompt and tools
 */
export function createSubAgents(ai: CletusAI) {
  const plannerTools = createPlannerTools(ai);
  const librarianTools = createLibrarianTools(ai);
  const clerkTools = createClerkTools(ai);
  const secretaryTools = createSecretaryTools(ai);
  const architectTools = createArchitectTools(ai);
  const artistTools = createArtistTools(ai);
  const dbaAgent = createDBAAgent(ai);

  // Planner sub-agent
  const planner = ai.prompt({
    name: 'planner',
    description: 'Manages todos and task planning',
    content: `You are the Planner agent for Cletus, responsible for managing todos and task planning.

{{#if currentTodo}}
Current Todo: {{currentTodo.name}}
{{/if}}

{{#if todos.length}}
Active Todos:
{{#each todos}}
{{@index}}. [{{#if this.done}}✓{{else}} {{/if}}] {{this.name}}
{{/each}}
{{/if}}

User request: {{request}}

Your role is to help break down complex requests into manageable todos, track progress, and keep tasks organized.`,
    tools: plannerTools,
    schema: false,
    input: (input, ctx) => ({
      currentTodo: input?.currentTodo,
      todos: input?.todos || [],
      request: input?.request || '',
    }),
  });

  // Librarian sub-agent
  const librarian = ai.prompt({
    name: 'librarian',
    description: 'Manages knowledge base and semantic search',
    content: `You are the Librarian agent for Cletus, responsible for managing the knowledge base.

Knowledge sources can be formatted as:
- {dataType}:{id} - Knowledge from data records
- fileSummary:{path} - High-level file summaries
- fileChunk:{path}[{index}] - Specific file sections
- user - User-provided memories

User request: {{request}}

Your role is to help search, add, and manage knowledge entries for semantic search and context retrieval.`,
    tools: librarianTools,
    schema: false,
    input: (input, ctx) => ({
      request: input?.request || '',
    }),
  });

  // Clerk sub-agent
  const clerk = ai.prompt({
    name: 'clerk',
    description: 'Manages file operations within the current working directory',
    content: `You are the Clerk agent for Cletus, responsible for file operations.

IMPORTANT: All file operations are relative to the current working directory: {{cwd}}
You do not have access outside of it. You can only operate on text-based files.

User request: {{request}}

Your role is to help search, read, create, modify, and organize files within the project directory.`,
    tools: clerkTools,
    schema: false,
    input: (input, ctx) => ({
      cwd: ctx.cwd,
      request: input?.request || '',
    }),
  });

  // Secretary sub-agent
  const secretary = ai.prompt({
    name: 'secretary',
    description: 'Manages user memory and assistant personas',
    content: `You are the Secretary agent for Cletus, responsible for managing user memory and assistant personas.

Available Assistants: {{assistants}}

User request: {{request}}

Your role is to help manage user memories, switch between assistant personas, and maintain assistant configurations.`,
    tools: secretaryTools,
    schema: false,
    input: (input, ctx) => ({
      assistants: input?.assistants || [],
      request: input?.request || '',
    }),
  });

  // Architect sub-agent
  const architect = ai.prompt({
    name: 'architect',
    description: 'Manages type definitions for custom data',
    content: `You are the Architect agent for Cletus, responsible for managing type definitions.

IMPORTANT: When updating types, you MUST ensure backwards compatibility:
- Never change field names or types (except to make more flexible like string)
- Never change a field from optional to required if data exists
- Only add new fields, update descriptions, or make fields more flexible

{{#if types.length}}
Current Types:
{{#each types}}
- {{this.name}}: {{this.friendlyName}}{{#if this.description}} - {{this.description}}{{/if}}
{{/each}}
{{/if}}

User request: {{request}}

Your role is to help create and modify type definitions while maintaining data integrity.`,
    tools: architectTools,
    schema: false,
    input: (input, ctx) => ({
      types: ctx.config.types,
      request: input?.request || '',
    }),
  });

  // Artist sub-agent
  const artist = ai.prompt({
    name: 'artist',
    description: 'Handles image generation, editing, and analysis',
    content: `You are the Artist agent for Cletus, responsible for image operations.

Generated images are saved to .cletus/images/ and linked in chat messages via file:// syntax.
You can generate new images, edit existing ones, analyze images, describe them, or find images matching descriptions.

User request: {{request}}

Your role is to help with all image-related tasks including creation, modification, and understanding visual content.`,
    tools: artistTools,
    schema: false,
    input: (input, ctx) => ({
      request: input?.request || '',
    }),
  });

  return {
    planner,
    librarian,
    clerk,
    secretary,
    architect,
    artist,
    dba: dbaAgent,
  };
}
