import { AnyTool, Names, Tuple } from '@aits/core';
import type { CletusAI, CletusAIContext, CletusContext } from '../ai';
import { Operations } from '../operations/types';
import { createArchitectTools } from '../tools/architect';
import { createArtistTools } from '../tools/artist';
import { createClerkTools } from '../tools/clerk';
import { createDBAAgent } from '../tools/dba';
import { createInternetTools } from '../tools/internet';
import { createLibrarianTools } from '../tools/librarian';
import { createPlannerTools } from '../tools/planner';
import { createSecretaryTools } from '../tools/secretary';
import { OperationKind } from '../schemas';

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
  const internetTools = createInternetTools(ai);
  const dba = createDBAAgent(ai);

  const filterTools = <TTools extends Tuple<AnyTool>>(tools: TTools) => {
    const isPlanMode = (name: OperationKind, ctx: CletusAIContext) => {
      const modeFn = Operations[name]?.mode || 'unknown';
      const mode = typeof modeFn === 'function' ? modeFn({}, ctx) : modeFn;
      return mode === 'local' || mode === 'read';
    };

    return (input: any, ctx: CletusAIContext) => {
      if (ctx.chat?.agentMode === 'plan') {
        return tools.filter(t => isPlanMode(t.name, ctx)).map(t => t.name) as Names<TTools>[];
      } else {
        return tools.map(t => t.name) as Names<TTools>[];
      }
    }
  }

  // Planner sub-agent
  const planner = ai.prompt({
    name: 'planner',
    description: 'Manages todos and task planning',
    content: `You are the Planner agent for Cletus, responsible for managing todos planning.

Your role is to help break down complex requests into manageable todos, track progress, and keep todos organized.

You have been given the following request to perform by the chat agent, the conversation follows.
It is VERY IMPORTANT you follow this request - it came from Cletus based on user input. A conversation follows but Cletus has already determined you are the right agent for this part of the request. 
Do ONLY this part of the request, Cletus will handle other parts with other agents.
<userRequest>
{{request}}
</userRequest>

<userInformation>
{{userPrompt}}
</userInformation>
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
It is VERY IMPORTANT you follow this request - it came from Cletus based on user input. A conversation follows but Cletus has already determined you are the right agent for this part of the request. 
Do ONLY this part of the request, Cletus will handle other parts with other agents.
<userRequest>
{{request}}
</userRequest>

Knowledge sources can be formatted as:
- {dataType}:{id} - Knowledge from data records
- file@{path}:summary - High-level file summaries
- file@{path}:chunk[{index}] - Specific file sections
- user - User-provided memories

<userInformation>
{{userPrompt}}
</userInformation>
`,
    tools: librarianTools,
    retool: filterTools(librarianTools),
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
It is VERY IMPORTANT you follow this request - it came from Cletus based on user input. A conversation follows but Cletus has already determined you are the right agent for this part of the request. 
Do ONLY this part of the request, Cletus will handle other parts with other agents.
<userRequest>
{{request}}
</userRequest>
    
<IMPORTANT>
- All file operations are relative to the current working directory: {{cwd}}
- You do not have access outside of it.
</IMPORTANT>

<userInformation>
{{userPrompt}}
</userInformation>
`,
    tools: clerkTools,
    retool: filterTools(clerkTools),
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
It is VERY IMPORTANT you follow this request - it came from Cletus based on user input. A conversation follows but Cletus has already determined you are the right agent for this part of the request. 
Do ONLY this part of the request, Cletus will handle other parts with other agents.
<userRequest>
{{request}}
</userRequest>

Available Assistants: {{assistants}}

<userInformation>
{{userPrompt}}
</userInformation>
`,
    tools: secretaryTools,
    retool: filterTools(secretaryTools),
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
It is VERY IMPORTANT you follow this request - it came from Cletus based on user input. A conversation follows but Cletus has already determined you are the right agent for this part of the request. 
Do ONLY this part of the request, Cletus will handle other parts with other agents.
<userRequest>
{{request}}
</userRequest>

IMPORTANT: When updating types, you MUST ensure backwards compatibility:
- Never change field names or types (except to make more flexible like string)
- Never change a field from optional to required if data exists
- Only add new fields, update descriptions, or make fields more flexible

<userInformation>
{{userPrompt}}
</userInformation>
`,
    tools: architectTools,
    retool: filterTools(architectTools),
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
It is VERY IMPORTANT you follow this request - it came from Cletus based on user input. A conversation follows but Cletus has already determined you are the right agent for this part of the request. 
Do ONLY this part of the request, Cletus will handle other parts with other agents.
<userRequest>
{{request}}
</userRequest>

Generated images are saved to .cletus/images/ and linked in chat messages via [filename](filepath) syntax.
You can generate new images, edit existing ones, analyze images, describe them, or find images matching descriptions.

<userInformation>
{{userPrompt}}
</userInformation>
`,
    tools: artistTools,
    retool: filterTools(artistTools),
    metadataFn: (_, { config, chat }) => ({
      model: chat?.model || config.getData().user.models?.chat,
    }),
    input: ({ request }: { request: string }, { userPrompt }) => ({ userPrompt, request }),
  });

  // Internet sub-agent
  const internet = ai.prompt({
    name: 'internet',
    description: 'Handles web searches, page fetching, and REST API calls',
    content: `You are the Internet agent for Cletus, responsible for web operations.

Your role is to help with web searches, fetching web page content, and making REST API calls.

You have been given the following request to perform by Cletus, the conversation follows.
It is VERY IMPORTANT you follow this request - it came from Cletus based on user input. A conversation follows but Cletus has already determined you are the right agent for this part of the request. 
Do ONLY this part of the request, Cletus will handle other parts with other agents.
<userRequest>
{{request}}
</userRequest>

You can:
- Search the web using Tavily API (requires API key to be configured)
- Fetch and extract content from web pages (HTML or plain text, with optional regex filtering)
- Make REST API calls to external services (GET, POST, PUT, DELETE, etc.)

<userInformation>
{{userPrompt}}
</userInformation>
`,
    tools: internetTools,
    retool: filterTools(internetTools),
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
    internet,
    dba,
  ] as [
    typeof planner,
    typeof librarian,
    typeof clerk,
    typeof secretary,
    typeof architect,
    typeof artist,
    typeof internet,
    typeof dba,
  ];
}
