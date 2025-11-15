import { z } from 'zod';
import type { CletusAI } from '../ai';
import { createSubAgents } from './sub-agents';
import { abbreviate } from '../common';
import { Operations } from '../operations/types';
import { ComponentOutput } from '@aits/core';

/**
 * Create the main chat agent that routes to sub-agents
 */
export function createChatAgent(ai: CletusAI) {
  // Create all sub-agents
  const subAgents = createSubAgents(ai);

  const [
    { refs: plannerTools }, 
    { refs: librarianTools },
    { refs: clerkTools },
    { refs: secretaryTools },
    { refs: architectTools },
    { refs: artistTools },
    { refs: internetTools },
    { refs: dbaTools },
  ] = subAgents;

  // Create the routing tool that decides which sub-agent to use
  const delegate = ai.tool({
    name: 'delegate',
    description: 'Delegate work to a specialized sub-agent',
    instructionsFn: ({ cwd }) => `Use this tool to route requests to specialized agents:

- **planner**: The user will make requests and when a request takes multiple steps to complete, you should use the planner agent to create and manage todos for Cletus to perform. These are only to keep track of Cletus's own work and should not be presented to the user unless explicitly asked for.
${plannerTools.map(tool => `  - ${Operations[tool.name].signature}`).join('\n')}
  
- **librarian**: Knowledge search, semantic search, managing knowledge. Knowledge is built from custom data, indexed files, and explicitly created by the user. It's text that can be retrieved with semantic search.
${librarianTools.map(tool => `  - ${Operations[tool.name].signature}`).join('\n')}
  
- **clerk**: File operations (text search, semantic search, read, create, edit, delete, move, copy, info, summarization, indexing)
${clerkTools.map(tool => `  - ${Operations[tool.name].signature}`).join('\n')}

- **secretary**: User memory, assistant personas, switching assistants
${secretaryTools.map(tool => `  - ${Operations[tool.name].signature}`).join('\n')}

- **architect**: Type definitions, creating/modifying data schemas
${architectTools.map(tool => `  - ${Operations[tool.name].signature}`).join('\n')}

- **artist**: Image generation, editing, analysis, and search
${artistTools.map(tool => `  - ${Operations[tool.name].signature}`).join('\n')}

- **internet**: Web searches, page fetching, and REST API calls
${internetTools.map(tool => `  - ${Operations[tool.name].signature}`).join('\n')}

- **dba**: Data operations (create, update, delete, select, update many, delete many, aggregate) - when using this agent, you MUST specify the type of data to operate on using the 'type' parameter
${dbaTools.map(tool => `  - ${Operations[tool.name].signature}`).join('\n')}

Choose the appropriate agent based on what the user wants done.
The agent will NOT be fed the conversation and you need to provide a 'request' that includes all necessary details for the sub-agent to complete the task. This request should begin with human readable instructions followed by a technical description of what needs to be done (for example, a signature of one of the above tools with parameters filled in).

<rules>
- If the user requests an action around data types defined that can be accomplished with a database query like tool call - use the 'dba'.
- If the user requests anything related to images, use the 'artist' agent.
- If the user requests anything related to web searches, fetching web pages, or making API calls, use the 'internet' agent.
- If the user requests anything that would involve making multiple steps or tracking progress over time, use the 'planner' agent.
- If the user requests anything related to file operations, use the 'clerk' agent.
- If the user requests anything to a perceived data type that they don't have yet - confirm they want to create a new type with the 'architect' agent.
- If the user wants to create something and it sounds like a record or data entry, use the 'dba' agent - if they mention a concept that doesn't exist confirm if necessary and use the 'architect'.
- If the user explicitly asks to memories, or assistants - use the 'secretary' agent.
- If the user says something and it sounds important to remember for all future conversations, use the 'secretary' agent to add a memory.
- All file operations are done within the current working directory - not outside. All files are relative. CWD: ${cwd}
- Todos are exlusively for Cletus's internal management of user requests. They are only referred to as todos - anything else should assumed to be a separate data type.
- If you've executed ANY tools - DO NOT ask a question at the end of your response. You are either going to automatically continue your work OR the user will respond next. NEVER ask a question after executing tools. Only for clarifications.
</rules>
`,
    schema: ({ config }) => {
      return z.object({
        agent: z.enum(['planner', 'librarian', 'clerk', 'secretary', 'architect', 'artist', 'internet', 'dba']).describe('Which sub-agent to use'),
        request: z.string().describe('The user request to pass along to the sub-agent. Include all necessary details for the sub-agent to make accurate tool calls.'),
        typeName: z.enum(config.getData().types.map(t => t.name) as [string, ...string[]]).nullable().describe('The type of data to operate on (required for dba agent)'),
      });
    },
    refs: subAgents,
    call: async ({ agent, typeName, request }, [planner, librarian, clerk, secretary, architect, artist, internet, dba], ctx) => {
      ctx.log('Routing to sub-agent: ' + agent + (typeName ? ` (type: ${typeName})` : '') + ' with request: ' + request);

      ctx.chatStatus(`Delegating ${agent === 'dba' ? `${typeName} request `: ``}to ${agent}: ${abbreviate(request, 80)}`);

      const operationProgress = ctx.ops.operations.length;
      const tools = await (() => {
        if (agent === 'dba') {
          const types = ctx.config.getData().types;
          const type = typeName ? types.find(t => t.name === typeName) : undefined;
          if (!type) {
            throw new Error('The dba agent requires a type parameter to specify the data type to operate on. given: ' + (typeName || '(null))'));
          }
          
          return dba.get('tools', { request }, { ...ctx, type, messages: [] });
        } else {
          const subAgent = {
            planner,
            librarian,
            clerk,
            secretary,
            architect,
            artist,
            internet,
          }[agent];

          if (!subAgent) {
            throw new Error(`Invalid sub-agent: ${agent || '(null)'}`);
          }

          return subAgent.get('tools', { request }, { ...ctx, messages: [] });
        }
      })();

      ctx.chatStatus(`Processing ${agent} results...`);

      const agentInstructions = !tools?.length
        ? `The ${agent} agent could not find any appropriate tools to handle the request. You should try a different agent or provide more details in the request and try again.`
        : ctx.ops.automatedOperations(operationProgress)
          ? `The ${agent} agent was able to complete all operations without user approval. The agent loop will continue - DO NOT RESPOND to the user yet. No questions. You will enter an automated loop until interrupted.`
          : ctx.ops.needsUserInput(operationProgress)
            ? `The ${agent} is handing operations off to the user for approval before proceeding. Present the operations clearly for approval - be concise but don't leave out any important details. DO NOT ask questions, the user will automatically be prompted for permission.`
            : `The ${agent} agent is in a state where it needs user input before proceeding. Wait for the user to respond. Ask questions that are needed to get tool calls correct.`;

      return { tools, agentInstructions };
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

The current agent mode determines which sub-agents are available:
- In 'default' mode, all sub-agents are available for delegation
- In 'plan' mode, only the planner sub-agent is available - use this mode when focusing on planning and task management

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
IMPORTANT: 
- If the last message is an assistant message and you don't have anything to add, do NOT respond again - wait for the user to make another request. Respond with no content.
- Do not perform the same operations multiple times unless the user explicitly asks you to.
</behavior>

<plan-mode>
When the agent is in 'plan' mode the goal is to have the planner refine the todos until the user is satisfied and switches out of 'plan' mode.
You do NOT mark todos done in this mode unless the user explicitly says to OR the todo represents a read-only operation.
You should first use tools to read/select information to build the plan. Don't assume the plan is correct until you've verified all the details with tools and user input when appropriate.
</plan-mode>

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
    toolsMax: 50,
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
