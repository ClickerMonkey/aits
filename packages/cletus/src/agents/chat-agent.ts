import { z } from 'zod';
import type { CletusAI } from '../ai';
import { createSubAgents } from './sub-agents';
import { abbreviate } from '../common';

/**
 * Create the main chat agent that routes to sub-agents
 */
export function createChatAgent(ai: CletusAI) {
  // Create all sub-agents
  const subAgents = createSubAgents(ai);

  // Create the routing tool that decides which sub-agent to use
  const delegate = ai.tool({
    name: 'delegate',
    description: 'Delegate work to a specialized sub-agent',
    instructions: `Use this tool to route requests to specialized agents:

- **planner**: The user will make requests and when a request takes multiple steps to complete, you should use the planner agent to create and manage todos for Cletus to perform. These are only to keep track of Cletus's own work and should not be presented to the user unless explicitly asked for.
  - todos_clear()
  - todos_list()
  - todos_add(name: string)
  - todos_done(id: string)
  - todos_get(id: string)
  - todos_remove(id: string)
  - todos_replace(todos: Array<{name: string, done?: boolean}>)

- **librarian**: Knowledge search, semantic search, managing knowledge. Knowledge is built from custom data, indexed files, and explicitly created by the user. It's text that can be retrieved with semantic search.
  - knowledge_search(query: string, limit?: number, sourcePrefix?: string)
  - knowledge_sources()
  - knowledge_add(text: string)
  - knowledge_delete(sourcePrefix: string)

- **clerk**: File operations (text search, semantic search, read, create, edit, delete, move, copy, info, summarization, indexing)
  - file_search(glob: string, limit?: number, offset?: number)
  - file_summary(path: string, characterLimit?: number, describeImages?: boolean, extractImages?: boolean, transcribeImages?: boolean)
  - file_index(glob: string, index: 'content' | 'summary', describeImages?: boolean, extractImages?: boolean, transcribeImages?: boolean)
  - file_create(path: string, content: string)
  - file_copy(glob: string, target: string)
  - file_move(glob: string, target: string)
  - file_stats(path: string)
  - file_delete(path: string)
  - file_read(path: string, characterLimit?: number, describeImages?: boolean, extractImages?: boolean, transcribeImages?: boolean)
  - text_search(glob: string, regex: string, surrounding?: number, caseInsensitive?: boolean, output?: 'file-count' | 'files' | 'match-count' | 'matches', offset?: number, limit?: number, transcribeImages?: boolean)
  - dir_create(path: string)

- **secretary**: User memory, assistant personas, switching assistants
  - assistant_switch(name: string)
  - assistant_update(name: string, prompt: string)
  - assistant_add(name: string, prompt: string)
  - memory_list()
  - memory_update(content: string)

- **architect**: Type definitions, creating/modifying data schemas
  - type_info(name: string)
  - type_update(name: string, update: {friendlyName?: string, description?: string, knowledgeTemplate?: string, fields?: Record<string, object | null>})
  - type_create(name: string, friendlyName: string, description?: string, knowledgeTemplate: string, fields: Array<{name: string, friendlyName: string, type: string, default?: any, required?: boolean, enumOptions?: string[]}>)

- **artist**: Image generation, editing, analysis, and search
  - image_generate(prompt: string, n?: number)
  - image_edit(prompt: string, imagePath: string)
  - image_analyze(prompt: string, imagePaths: string[], maxCharacters?: number)
  - image_describe(imagePath: string)
  - image_find(prompt: string, glob: string, maxImages?: number, n?: number)

- **dba**: Data operations (create, update, delete, select, update many, delete many, aggregate) - when using this agent, you MUST specify the type of data to operate on using the 'type' parameter
  - data_create(fields: object)
  - data_update(id: string, fields: object)
  - data_delete(id: string)
  - data_select(where?: object, offset?: number, limit?: number, orderBy?: Array<{field: string, direction: 'asc' | 'desc'}>)
  - data_update_many(set: object, where?: object, limit?: number)
  - data_delete_many(where: object, limit?: number)
  - data_aggregate(groupBy?: string[], where?: object, having?: object, select: Array<{function: string, field?: string, alias?: string}>, orderBy?: Array<{field: string, direction: 'asc' | 'desc'}>)

Choose the appropriate agent based on what the user wants done.
The agent will be fed the conversation and you need to provide a 'request' that includes all necessary details for the sub-agent to complete the task.

<rules>
- If the user requests an action around data types defined that can be accomplished with a database query like tool call - use the 'dba'.
- If the user requests anything related to images, use the 'artist' agent.
- If the user requests anything that would involve making multiple steps or tracking progress over time, use the 'planner' agent.
- If the user requests anything related to file operations, use the 'clerk' agent.
- If the user requests anything to a perceived data type that they don't have yet - confirm they want to create a new type with the 'architect' agent.
- If the user wants to create something and it sounds like a record or data entry, use the 'dba' agent - if they mention a concept that doesn't exist confirm if necessary and use the 'architect'.
- If the user explicitly asks to memories, or assistants - use the 'secretary' agent.
- If the user says something and it sounds important to remember for all future conversations, use the 'secretary' agent to add a memory.
- All file operations are done within the current working directory - not outside. All files are relative.
- Todos are exlusively for Cletus's internal management of user requests. They are only referred to as todos - anything else should assumed to be a separate data type.
</rules>
`,
    schema: ({ config }) => z.object({
      agent: z.enum(['planner', 'librarian', 'clerk', 'secretary', 'architect', 'artist', 'dba']).describe('Which sub-agent to use'),
      request: z.string().describe('The user request to pass along to the sub-agent'),
      typeName: z.enum(config.getData().types.map(t => t.name) as [string, ...string[]]).nullable().describe('The type of data to operate on (required for dba agent)'),
    }),
    refs: subAgents,
    call: async ({ agent, typeName, request }, [planner, librarian, clerk, secretary, architect, artist, dba], ctx) => {
      ctx.log('Routing to sub-agent: ' + agent + (typeName ? ` (type: ${typeName})` : '') + ' with request: ' + request);

      ctx.chatStatus(`Delegating ${agent === 'dba' ? `${typeName} request `: ``}to ${agent}: ${abbreviate(request, 50)}`);

      if (agent === 'dba') {
        const types = ctx.config.getData().types;
        const type = typeName ? types.find(t => t.name === typeName) : undefined;
        if (!type) {
          throw new Error('The dba agent requires a type parameter to specify the data type to operate on. given: ' + (typeName || '(null))'));
        }
        
        const tools = await dba.get('tools', { request }, { ...ctx, type });

        // @ts-ignore
        if (tools.length === 0) {
          throw new Error('No dba tools matched the request, try a different agent: ' + request);
        }

        return tools;
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

        const tools = await subAgent.get('tools', { request }, ctx);

        // @ts-ignore
        if (tools.length === 0) {
          throw new Error(`No ${agent} tools matched the request, try a different agent: ` + request);
        }

        return tools;
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
    tools: [delegate],
    toolsMax: 5,
    metadata: {
      weights: {
        speed: 0.7,
        accuracy: 0.3,
      },
    },
    config: {
      toolsOneAtATime: true,
    },
    metadataFn: (_, { config, chat }) => ({
      model: chat?.model || config.getData().user.models?.chat,
    }),
    input: (input: {}, ctx) => ({ userPrompt: ctx.userPrompt }),
  });

  return chatPrompt;
}
