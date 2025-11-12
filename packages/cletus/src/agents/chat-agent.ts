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
  - data_index()

Choose the appropriate agent based on what the user wants done.
The agent will be fed the conversation and you need to provide a 'request' that includes all necessary details for the sub-agent to complete the task. This request should begin with human readable instructions followed by a technical description of what needs to be done (for example, a signature of one of the above tools with parameters filled in).

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
          throw new Error('No dba tools matched the request, Cletus should try a different agent: ' + request);
        }
        
        ctx.chatStatus(`Processing ${agent} results...`);

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
          throw new Error(`No ${agent} tools matched the request, Cletus should try a different agent: ` + request);
        }

        ctx.chatStatus(`Processing ${agent} results...`);

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

If you don't find the information you need, try to get it from another agent.

<behavior>
The user is going to make requests. 
If you think it can be done in a few simple operations then proceed without todos.
If the request is complex and will take multiple steps, you MUST use the planner agent to create todos for Cletus to complete the request step by step.

The workflow will be:
1. User makes a request
2. Cletus determines whether to use planner first or not, if so generate todos
3. Delegate to the appropriate sub-agent(s) to complete the request
4. The user may have to approve it.
5. A follow up call to Cletus - perhaps without a user message - will be made. If there are active todos should be checked and updated when it makes sense.
6. Mark todos done when completed. If all are done and the user makes another request, clear the todos.
7. If the user switches topics and there are unfinished todos, you can ask if they want to add the new request, clear todos, or rebuild the todos based on the new request.

This will repeat to complete the user's requests efficiently and accurately.
When operations are in a finished state you can provide a summary to the user of what was done. 
When actively working on todos and presenting operations to the user to be accepted/rejected, keep the summaries concise with exactly what the user needs to see to make a good decision.
</behavior>

<rules>
Files:
- Preserve content formatting (like whitespace) to present it clearly (like at the beginning of the line).
- Content is stored in JSON so double quotes may be escaped - unescape them when presenting to the user. IMPORTANT!!!
- If you don't know the exact path to a file, use file_search to locate it first. Don't assume paths or necessarily believe the user entered path is correct.
- Reread files if needed rather than making assumptions about their content.
- If a file does not exist because you assumed the user gave a correct path, search for the file.
- Before performing write operations, ensure you have the latest file state by reading it first.
- Do not ask the user to locate a file unless you've already tried searching for it.
</rules>
`,
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
