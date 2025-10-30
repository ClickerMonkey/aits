import z from "zod";

import { Agent } from "./agent";
import { consumeAll } from "./common";
import { Prompt } from "./prompt";
import { Tool } from "./tool";
import { ComponentsAll, Context, withEvents } from "./types";

interface MyMetadata { 
  requirements?: Array<'text' | 'vision' | 'images' | 'hearing' | 'voice'>;
}

interface MyContext {
  systemPrompt?: string;
  user?: string;
}

type MyFullContext = Context<MyContext, MyMetadata>;

// simple example

const relevantInfo = new Tool({
  name: "relevant_info",
  description: "A tool for retrieval augmented generation.",
  instructions: `{{systemPrompt}} Retrieve relevant documents and generate a response based on user query.`,
  types: { context: {} as MyContext },
  input: (ctx) => ({ systemPrompt: ctx.systemPrompt }),
  schema: z.object({
    query: z.string().min(1, "Query cannot be empty."),
    topK: z.number().min(1).max(10).default(5), 
  }),
  call: (input) => {
    return { success: true, result: [input.query] };
  },
});

const chat = new Prompt({
  name: "Chat Prompt",
  description: "A prompt for chat-based interactions.",
  content: "You are a chat agent, answer the user's questions based on the context provided.",
  tools: [relevantInfo],
});

// advanced example

const email = new Tool({
  name: "send_email",
  description: "A tool to send emails.",
  instructions: `Send an email based on the provided details.`,
  schema: z.object({
    to: z.string(),
    subject: z.string().min(1, "Subject cannot be empty."),
    body: z.string().min(1, "Body cannot be empty."),
  }),
  call: (input) => {
    return { success: true, result: `Email sent to ${input.to} with subject "${input.subject}"` };
  },
});

const help = new Tool({
  name: "help",
  description: "A tool to provide help information about available tools.",
  instructions: `Provide help information based on the user's query.`,
  schema: z.object({
    topics: z.array(z.enum(['email', 'documents', 'chat'])),
  }),
  call: (input) => {
    return { success: true, result:  `Help information for query: ${input.topics.join(", ")}` };
  },
});

const remember = new Tool({
  name: "remember",
  description: "A tool to remember important information.",
  instructions: `Store important information that can be recalled later.`,
  schema: z.object({
    info: z.string().min(1, "Information cannot be empty."),
    type: z.enum(['short-term', 'long-term']).default('short-term'),
  }),
  call: (input) => {
    return { success: true, result: `Remembered ${input.type} information: ${input.info}` };
  },
});

const secretaryPrompt = new Prompt({
  name: "secretary_prompt",
  description: "A prompt for a secretary agent to manage emails and documents.",
  content: `You are a secretary agent that helps manage emails, retrieve documents, and provide assistance.\n\nInstructions: {{instructions}}`,
  tools: [email, help, remember],
  input: (input) => input,
  retool: (input) => input?.recipients.length ? ['send_email', 'help', 'remember'] : ['help', 'remember'],
  types: { 
    context: {} as MyContext,
    metadata: {} as MyMetadata, 
    input: {} as { instructions: string, recipients: string[] }
  },
});

const secretary = new Agent({
  name: "secretary",
  description: "An agent that manages emails, documents, and provides help.",
  refs: [secretaryPrompt],
  call: (input, [prompt]) => {
    return prompt.get({
      instructions: input.instructions,
      recipients: ['pdiffenderfer@gmail.com'],
    }, 'streamTools');
  },
  types: {
    input: {} as { instructions: string },
  },
});

const searchFiles = new Tool({
  name: "search_files",
  description: "A tool to search files based on a query.",
  instructions: `Search files and return relevant results based on the user's query.`,
  schema: z.object({
    query: z.string().min(1, "Query cannot be empty."),
  }),
  call: (input) => {
    return {
      success: true,
      result: `Search results for query: ${input.query}`,
    };
  },
});

const librarianPrompt = new Prompt({
  name: "librarian_prompt",
  description: "A prompt for a librarian agent to retrieve documents and assist in chat.",
  content: `You are a librarian agent that retrieves documents and provides chat assistance\n\nInstructions: {{instructions}}`,
  tools: [relevantInfo, searchFiles],
  input: (input: { instructions: string }) => input,
});

const librarian = new Agent({
  name: "librarian",
  description: "An agent that retrieves documents and provides chat assistance.",
  refs: [librarianPrompt],
  call: (input: { instructions: string }, [prompt], ctx) => {
    return prompt.get(input, 'streamTools', ctx);
  }
});

const imageGenerate = new Tool({
  name: "image_generate",
  description: "A tool to generate images based on a prompt.",
  instructions: `Generate an image based on the provided prompt.`,
  schema: z.object({
    prompt: z.string().min(1, "Prompt cannot be empty."),
    style: z.enum(['realistic', 'cartoon', 'abstract']).default('realistic'),
  }),
  call: (input) => {
    return {
      success: true,
      result: `Generated a ${input.style} image for prompt: ${input.prompt}`
    };
  },
});

const artistPrompt = new Prompt({
  name: "artist_prompt",
  description: "A prompt for an artist agent to create images based on user prompts.",
  content: `You are an artist agent that creates images based on user prompts.\n\nInstructions: {{instructions}}`,
  tools: [imageGenerate],
  input: (input: { instructions: string }) => input,
});

const artist = new Agent({
  name: "artist",
  description: "An agent that creates images based on user prompts.",
  refs: [artistPrompt],
  call: (input: { instructions: string }, [prompt], ctx) => {
    return prompt.get(input, 'streamTools', ctx);
  },
});

const planExecutor = new Tool({
  name: "plan_executor",
  description: "A tool to execute plans created by the planner agent.",
  instructions: `Execute the steps outlined in the plan.`,
  schema: z.object({
    plan: z.array(z.object({
      userSummary: z.string(),
      agent: z.enum(['librarian', 'secretary', 'artist']),
      agentInstructions: z.string(),
    })),
  }),
  refs: [librarian, secretary, artist],
  call: async (input, [librarian, secretary, artist], ctx) => {
    const stepResults = await Promise.all(input.plan.map(async (step) => {
      switch (step.agent) {
        case 'librarian':
          return await consumeAll(librarian.run({ instructions: step.agentInstructions }, ctx));
        case 'secretary':
          return await consumeAll(secretary.run({ instructions: step.agentInstructions }, ctx));
        case 'artist':
          return await consumeAll(artist.run({ instructions: step.agentInstructions }, ctx));
      }
    }));
    
    return stepResults.flat();
  },
});

const chatAgent = new Prompt({
  name: "chat_agent",
  description: "A chat agent that can use document retrieval and secretary tools.",
  content: `You are a chat agent that assists users by retrieving documents and managing emails.`,
  tools: [planExecutor],
});

// Example runs

async function runChatResult() {
  const r = await chatAgent.get();

  assert<string>()<typeof r>(true);
  
  console.log("Chat Agent Result:", r);
}

async function runChatOutput() {
  const stream = chatAgent.run();
  
  for await (const ev of stream) {
    if (ev.type === 'toolOutput') {
      const toolName = ev.tool.name;
      assert<"plan_executor">()<typeof toolName>(true);
      assert<
        Array<{
          tool: "relevant_info";
          result: {
            success: boolean;
            result: string[];
          };
        } | {
          tool: "search_files";
          result: {
            success: boolean;
            result: string;
          };
        } | {
          tool: "send_email";
          result: {
            success: boolean;
            result: string;
          };
        } | {
          tool: "help";
          result: {
            success: boolean;
            result: string;
          };
        } | {
          tool: "remember";
          result: {
            success: boolean;
            result: string;
          };
        } | {
          tool: "image_generate";
          result: {
            success: boolean;
            result: string;
          };
        }>
      >()<typeof ev.result>(true);

      console.log(`Tool ${toolName}(${ev.args}) output:`, ev.result);
    }
  }
}

async function runChatWithEvents() {
  type All = ComponentsAll<typeof chatAgent>;
  const all: All = chatAgent as any;
  
  // Names are properly inferred
  assert<
    "plan_executor" | "librarian" | "secretary" | "artist" | "librarian_prompt" | "relevant_info" | "search_files" | "secretary_prompt" | "send_email" | "help" | "remember" | "artist_prompt" | "image_generate"
  >()<typeof all.name>(true);
  
  if (all.name === 'secretary_prompt') {
    // Specialized types are inferred correctly
    // @ts-ignore
    assert<
      Prompt<MyContext, MyMetadata, "secretary_prompt", {
        instructions: string;
        recipients: string[];
      }, string, [Tool<{}, {}, "send_email", {
        to: string;
        subject: string;
        body: string;
      }, {
        success: boolean;
        result: string;
      }, []>, Tool<{}, {}, "help", {
        topics: ("email" | "documents" | "chat")[];
      }, {
        success: boolean;
        result: string;
      }, []>, Tool<{}, {}, "remember", {
        info: string;
        type: "short-term" | "long-term";
      }, {
        success: boolean;
        result: string;
      }, []>]>
    >()<typeof all>(true);
  }
  
  chatAgent.run({}, {
    runner: withEvents<typeof chatAgent>({
      onPromptEvent({ component }, ev) {
        if (component.name === 'artist_prompt') {
          if (ev.type === 'toolOutput') {
            // Event types are inferred correctly
            assert<
              "relevant_info" | "search_files" | "send_email" |
              "help" | "remember" | "image_generate"
            >()<typeof ev.tool.name>(true);
            
            assert<{
              success: boolean;
              result: string[];
            } | {
              success: boolean;
              result: string;
            }>()<typeof ev.result>(true);
          }
        }
        if (ev.type === 'complete') {
          console.log(`Prompt ${component.name} output:`, ev.output);
        }
      },
      onStatus({ component }) {
        if (component.name === 'artist') {
          console.log('Running artist!', component);
        }
      }
    }),  
  }); 
}

type AssertExact<TExpected, TActual> =
  (<G>() => G extends TExpected ? 1 : 2) extends
  (<G>() => G extends TActual ? 1 : 2)
    ? true
    : never;

function assert<TExpected>() {
  return <TActual>(value: AssertExact<TExpected, TActual>) => value;
}