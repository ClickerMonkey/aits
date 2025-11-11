import type { CletusAI } from '../ai';
import { createArchitectTools } from '../tools/architect';
import { createArtistTools } from '../tools/artist';
import { createClerkTools } from '../tools/clerk';
import { createDBAAgent } from '../tools/dba';
import { createLibrarianTools } from '../tools/librarian';
import { createPlannerTools } from '../tools/planner';
import { createSecretaryTools } from '../tools/secretary';

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
  const dba = createDBAAgent(ai);

  // Planner sub-agent
  const planner = ai.prompt({
    name: 'planner',
    description: 'Manages todos and task planning',
    content: `You are the Planner agent for Cletus, responsible for managing todos planning.

<userInformation>
{{userPrompt}}
</userInformation>

Your role is to help break down complex requests into manageable todos, track progress, and keep todos organized.

You have been given the following request to perform by the chat agent, the conversation follows.
<userRequest>
{{request}}
</userRequest>
`,
    tools: plannerTools,
    metadataFn: (_, { config, chat }) => ({
      model: chat?.model || config.getData().user.models?.chat,
    }),
    input: ({ request }: { request: string }, { userPrompt }) => ({ userPrompt, request }),
  });

  // Librarian sub-agent
  const librarian = ai.prompt({
    name: 'librarian',
    description: 'Manages knowledge base and semantic search',
    content: `You are the Librarian agent for Cletus, responsible for managing the knowledge base.

Your role is to help search, add, and delete knowledge entries to assist with user requests.

You have been given the following request to perform by Cletus, the conversation follows.
<userRequest>
{{request}}
</userRequest>

<userInformation>
{{userPrompt}}
</userInformation>

Knowledge sources can be formatted as:
- {dataType}:{id} - Knowledge from data records
- file@{path}:summary - High-level file summaries
- file@{path}:chunk[{index}] - Specific file sections
- user - User-provided memories
`,
    tools: librarianTools,
    metadataFn: (_, { config, chat }) => ({
      model: chat?.model || config.getData().user.models?.chat,
    }),
    input: ({ request }: { request: string }, { userPrompt }) => ({ userPrompt, request }),
  });

  // Clerk sub-agent
  const clerk = ai.prompt({
    name: 'clerk',
    description: 'Manages file operations within the current working directory',
    content: `You are the Clerk agent for Cletus, responsible for file operations.

Your role is to help search, read, create, modify, and organize files within the project directory.

You have been given the following request to perform by Cletus, the conversation follows.
<userRequest>
{{request}}
</userRequest>

<userInformation>
{{userPrompt}}
</userInformation>
    
IMPORTANT: All file operations are relative to the current working directory: {{cwd}}
You do not have access outside of it. You can only operate on text-based files.
`,
    tools: clerkTools,
    metadataFn: (_, { config, chat }) => ({
      model: chat?.model || config.getData().user.models?.chat,
    }),
    input: ({ request }: { request: string }, { userPrompt, cwd }) => ({ userPrompt, request, cwd }),
  });

  // Secretary sub-agent
  const secretary = ai.prompt({
    name: 'secretary',
    description: 'Manages user memory and assistant personas',
    content: `You are the Secretary agent for Cletus, responsible for managing user memory and assistant personas.

Your role is to help manage user memories, switch between assistant personas, and maintain assistant configurations.

You have been given the following request to perform by Cletus, the conversation follows.
<userRequest>
{{request}}
</userRequest>

<userInformation>
{{userPrompt}}
</userInformation>

Available Assistants: {{assistants}}
`,
    tools: secretaryTools,
    metadataFn: (_, { config, chat }) => ({
      model: chat?.model || config.getData().user.models?.chat,
    }),
    input: ({ request }: { request: string }, { config, userPrompt }) => {
      const configData = config.getData();
      
      return {
        assistants: configData.assistants.map((a) => a.name).join(', '),
        userPrompt,
        request,
      };
    },
  });

  // Architect sub-agent
  const architect = ai.prompt({
    name: 'architect',
    description: 'Manages type definitions for custom data',
    content: `You are the Architect agent for Cletus, responsible for managing type definitions.
    
Your role is to help create and modify type definitions while maintaining data integrity.

You have been given the following request to perform by Cletus, the conversation follows.
<userRequest>
{{request}}
</userRequest>

<userInformation>
{{userPrompt}}
</userInformation>

IMPORTANT: When updating types, you MUST ensure backwards compatibility:
- Never change field names or types (except to make more flexible like string)
- Never change a field from optional to required if data exists
- Only add new fields, update descriptions, or make fields more flexible
`,
    tools: architectTools,
    metadataFn: (_, { config, chat }) => ({
      model: chat?.model || config.getData().user.models?.chat,
    }),
    input: ({ request }: { request: string }, { userPrompt }) => ({ userPrompt, request }),
  });

  // Artist sub-agent
  const artist = ai.prompt({
    name: 'artist',
    description: 'Handles image generation, editing, and analysis',
    content: `You are the Artist agent for Cletus, responsible for image operations.

Your role is to help with all image-related requests including creation, modification, and understanding visual content.

You have been given the following request to perform by Cletus, the conversation follows.
<userRequest>
{{request}}
</userRequest>

<userInformation>
{{userPrompt}}
</userInformation>

Generated images are saved to .cletus/images/ and linked in chat messages via file:// syntax.
You can generate new images, edit existing ones, analyze images, describe them, or find images matching descriptions.
`,
    tools: artistTools,
    metadataFn: (_, { config, chat }) => ({
      model: chat?.model || config.getData().user.models?.chat,
    }),
    input: ({ request }: { request: string }, { userPrompt }) => ({ userPrompt, request }),
  });

  return [
    planner,
    librarian,
    clerk,
    secretary,
    architect,
    artist,
    dba,
  ] as [
    typeof planner,
    typeof librarian,
    typeof clerk,
    typeof secretary,
    typeof architect,
    typeof artist,
    typeof dba,
  ];
}
