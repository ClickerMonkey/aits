# @aeye/core

Core primitives for building AI agents, tools, and prompts with TypeScript. Provides a type-safe, composable framework for creating sophisticated AI applications with structured inputs/outputs, tool calling, and context management.

## Features

- **🎯 Type-Safe Components** - Prompts, Tools, and Agents with full TypeScript support
- **🔧 Tool Calling** - Native support for function/tool calling with schema validation
- **📝 Template-Based Prompts** - Handlebars templates for dynamic prompt generation
- **✅ Schema Validation** - Zod integration for structured inputs and outputs
- **🌊 Streaming Support** - First-class streaming for real-time AI responses
- **🔄 Composable Architecture** - Tools can use other tools, prompts can use tools, agents orchestrate everything
- **📊 Context Management** - Type-safe context threading and automatic token window management
- **🎛️ Flexible Execution** - Sequential, parallel, or immediate tool execution modes

## Installation

```bash
npm install @aeye/core zod handlebars
```

## Core Concepts

### Components

All AI primitives implement the `Component` interface:

- **Prompt** - Generates AI responses with optional tool usage and structured outputs
- **Tool** - Extends AI capabilities with custom functions and external integrations
- **Agent** - Orchestrates complex workflows combining prompts and tools

### Context & Metadata

- **Context (`TContext`)** - Application-specific data threaded through operations (user, db, etc.)
- **Metadata (`TMetadata`)** - Execution settings for AI requests (model, temperature, etc.)

## Quick Start

### Basic Prompt

```typescript
import { Prompt } from '@aeye/core';
import z from 'zod';

const summarizer = new Prompt({
  name: 'summarize',
  description: 'Summarizes text concisely',
  content: 'Summarize the following text:\n\n{{text}}',
  
  // Transform input
  input: (input: { text: string }) => ({ text: input.text }),
  
  // Define output schema
  schema: z.object({
    summary: z.string().describe('A concise summary'),
    keyPoints: z.array(z.string()).describe('Main points')
  })
});

// Execute with a context that has an executor
const result = await summarizer.get(
  'result',
  { text: 'Long article text...' },
  {
    execute: yourAIExecutor, // Executor function from a provider
    messages: []
  }
);

console.log(result.summary);
console.log(result.keyPoints);
```

### Creating Tools

```typescript
import { Tool } from '@aeye/core';
import z from 'zod';

const weatherTool = new Tool({
  name: 'getWeather',
  description: 'Get current weather for a location',
  instructions: 'Use this tool to get weather data',
  
  schema: z.object({
    location: z.string().describe('City name or coordinates'),
    units: z.enum(['celsius', 'fahrenheit']).default('celsius')
  }),
  
  call: async (input, refs, ctx) => {
    const response = await fetch(
      `https://api.weather.com/v1/${input.location}`
    );
    const data = await response.json();
    
    return {
      temperature: data.temp,
      condition: data.condition,
      humidity: data.humidity
    };
  }
});
```

### Prompts with Tools

```typescript
const travelAdvisor = new Prompt({
  name: 'travelAdvisor',
  description: 'Provides travel advice based on weather',
  content: `You are a travel advisor. Help plan a trip to {{destination}}.
  
Use the weather tool to check current conditions, then provide:
- What to pack
- Activities to do
- Best times to visit`,
  
  input: (input: { destination: string }) => ({ 
    destination: input.destination 
  }),
  
  tools: [weatherTool],
  
  schema: z.object({
    recommendations: z.array(z.string()),
    packingList: z.array(z.string()),
    weatherNotes: z.string()
  })
});

// The AI will automatically call weatherTool if needed
const advice = await travelAdvisor.get(
  'result',
  { destination: 'Paris' },
  { execute: yourAIExecutor, messages: [] }
);
```

### Streaming Responses

```typescript
// Stream content only
for await (const chunk of summarizer.get(
  'streamContent',
  { text: 'Long text...' },
  { stream: yourAIStreamer, messages: [] }
)) {
  process.stdout.write(chunk);
}

// Stream all events (including tool calls)
for await (const event of summarizer.get(
  'stream',
  { text: 'Long text...' },
  { stream: yourAIStreamer, messages: [] }
)) {
  if (event.type === 'textPartial') {
    console.log('Text:', event.content);
  } else if (event.type === 'toolStart') {
    console.log('Tool started:', event.tool.name);
  } else if (event.type === 'toolOutput') {
    console.log('Tool result:', event.result);
  }
}
```

### Building Agents

```typescript
import { Agent } from '@aeye/core';

const researchAgent = new Agent({
  name: 'researcher',
  description: 'Conducts research on topics',
  
  refs: [searchTool, summarizeTool, analyzeTool],
  
  call: async (input: { topic: string }, [search, summarize, analyze], ctx) => {
    // Step 1: Search for information
    const searchResults = await search.run(
      { query: input.topic, limit: 5 },
      ctx
    );
    
    // Step 2: Summarize findings
    const summaries = [];
    for (const result of searchResults) {
      const summary = await summarize.get(
        'result',
        { text: result.content },
        ctx
      );
      summaries.push(summary);
    }
    
    // Step 3: Analyze and synthesize
    const analysis = await analyze.get(
      'result',
      { topic: input.topic, sources: summaries },
      ctx
    );
    
    return analysis;
  }
});

const research = await researchAgent.run(
  { topic: 'Quantum Computing' },
  { execute: yourAIExecutor, messages: [] }
);
```

## Prompt Modes

The `get` method supports different execution modes:

| Mode | Description | Returns |
|------|-------------|---------|
| `'result'` | Get final structured output | `TOutput` |
| `'tools'` | Get tool call results | `PromptToolOutput[]` |
| `'stream'` | Stream all events | `AsyncGenerator<PromptEvent>` |
| `'streamTools'` | Stream tool outputs | `AsyncGenerator<PromptToolOutput>` |
| `'streamContent'` | Stream text content only | `AsyncGenerator<string>` |

```typescript
// Get structured result
const result = await prompt.get('result', input, ctx);

// Get tool outputs only
const tools = await prompt.get('tools', input, ctx);

// Stream everything
for await (const event of prompt.get('stream', input, ctx)) {
  // Handle different event types
}
```

## Tool Execution Modes

Control how tools are executed:

```typescript
const prompt = new Prompt({
  name: 'multi-tool',
  description: 'Uses multiple tools',
  content: 'Analyze the data',
  tools: [tool1, tool2, tool3],
  
  // Tool execution mode
  toolExecution: 'parallel', // 'sequential' | 'parallel' | 'immediate'
  
  // Retry configuration
  toolRetries: 2,         // Retry failed tools
  toolIterations: 3,      // Max iterations for tool calls
  toolsMax: 5,           // Max total tool calls
});
```

- **`sequential`** - Wait for each tool to finish before continuing
- **`parallel`** - Start all tools at once, wait for all to complete
- **`immediate`** - Start tools immediately as they're available

## Advanced Features

### Context-Aware Tools

```typescript
const contextTool = new Tool({
  name: 'contextAware',
  description: 'A context-aware tool',
  instructions: 'Use this tool...',
  
  // Schema can depend on context
  schema: (ctx) => {
    if (ctx.userRole === 'admin') {
      return z.object({
        action: z.enum(['read', 'write', 'delete'])
      });
    }
    return z.object({
      action: z.enum(['read'])
    });
  },
  
  // Check if tool is applicable
  applicable: (ctx) => {
    return ctx.isAuthenticated === true;
  },
  
  call: async (input, refs, ctx) => {
    // Implementation with context access
  }
});
```

### Custom Validation

```typescript
const validatedTool = new Tool({
  name: 'placeOrder',
  description: 'Place an order',
  
  schema: z.object({
    itemId: z.string(),
    quantity: z.number().min(1)
  }),
  
  // Additional validation beyond schema
  validate: async (input, ctx) => {
    const inventory = await checkInventory(input.itemId);
    if (inventory < input.quantity) {
      throw new Error(`Only ${inventory} items available`);
    }
  },
  
  call: async (input, refs, ctx) => {
    // Place order
  }
});
```

### Event Tracking

```typescript
import { withEvents } from '@aeye/core';

const runner = withEvents({
  onStatus: (instance) => {
    console.log(`${instance.component.name}: ${instance.status}`);
    if (instance.status === 'completed') {
      const duration = instance.completed - instance.started;
      console.log(`Took ${duration}ms`);
    }
  },
  
  onPromptEvent: (instance, event) => {
    if (event.type === 'usage') {
      console.log('Tokens used:', event.usage);
    }
  }
});

const result = await prompt.get(
  'result',
  { text: 'Hello' },
  {
    execute: yourAIExecutor,
    messages: [],
    runner
  }
);
```

### Token Management

Automatic conversation trimming when token limits are reached:

```typescript
const context = {
  execute: yourAIExecutor,
  messages: conversationHistory,
  
  // Token configuration
  defaultCompletionTokens: 2048,
  
  // Custom token estimation
  estimateTokens: (message) => {
    return message.content.length / 4; // Rough estimate
  }
};

// Prompt will automatically trim messages if needed
const result = await prompt.get('result', { text: 'Query' }, context);
```

### Dynamic Reconfiguration

```typescript
const adaptivePrompt = new Prompt({
  name: 'adaptive',
  description: 'Adapts based on execution stats',
  content: 'Solve: {{problem}}',
  schema: z.object({ solution: z.string() }),
  
  // Adjust configuration during execution
  reconfig: (stats, ctx) => {
    // If tools are failing, change strategy
    if (stats.toolCallErrors > 3) {
      return {
        config: { toolsOneAtATime: true },
        maxIterations: 2
      };
    }
    return {};
  }
});
```

## API Reference

### Prompt

```typescript
class Prompt<TContext, TMetadata, TName, TInput, TOutput, TTools>
```

**Constructor Options:**
- `name: string` - Unique identifier
- `description: string` - Purpose description
- `content: string` - Handlebars template
- `input?: Function` - Transform input for template
- `schema?: ZodType | Function` - Output schema
- `config?: Partial<Request> | Function` - AI request config
- `tools?: Tool[]` - Available tools
- `toolExecution?: 'sequential' | 'parallel' | 'immediate'`
- `toolRetries?: number` - Retry failed tools
- `toolIterations?: number` - Max tool call iterations
- `outputRetries?: number` - Retry invalid outputs
- `metadata?: TMetadata` - Execution metadata
- `validate?: Function` - Post-validation hook
- `applicable?: Function` - Applicability check

**Methods:**
- `get(input, mode, ctx)` - Execute and retrieve output
- `run(input, ctx)` - Execute with full streaming
- `applicable(ctx)` - Check if prompt can run

### Tool

```typescript
class Tool<TContext, TMetadata, TName, TParams, TOutput, TRefs>
```

**Constructor Options:**
- `name: string` - Unique identifier
- `description: string` - Purpose description  
- `instructions?: string` - Handlebars usage instructions
- `schema: ZodType | Function` - Input schema
- `refs?: Component[]` - Referenced components
- `call: Function` - Implementation
- `validate?: Function` - Post-validation hook
- `applicable?: Function` - Applicability check

**Methods:**
- `run(input, ctx)` - Execute the tool
- `compile(ctx)` - Generate tool definition for AI
- `parse(ctx, args)` - Parse and validate arguments
- `applicable(ctx)` - Check if tool can run

### Agent

```typescript
class Agent<TContext, TMetadata, TName, TInput, TOutput, TRefs>
```

**Constructor Options:**
- `name: string` - Unique identifier
- `description: string` - Purpose description
- `refs?: Component[]` - Referenced components
- `call: Function` - Implementation with refs
- `applicable?: Function` - Applicability check

**Methods:**
- `run(input, ctx)` - Execute the agent
- `applicable(ctx)` - Check if agent can run

## Context Structure

```typescript
interface Context<TContext, TMetadata> {
  // Required: AI execution
  execute?: Executor<TContext, TMetadata>;
  stream?: Streamer<TContext, TMetadata>;
  
  // Messages
  messages: Message[];
  
  // Token management
  defaultCompletionTokens?: number;
  estimateTokens?: (message: Message) => number;
  
  // Execution control
  signal?: AbortSignal;
  runner?: Events;
  
  // User context (TContext) spreads here
  [key: string]: any;
}
```

## Request Configuration

```typescript
interface Request {
  messages: Message[];
  temperature?: number;      // 0-2
  topP?: number;            // 0-1
  maxTokens?: number;
  stop?: string | string[];
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'required' | 'none' | { tool: string };
  responseFormat?: 'text' | 'json' | ResponseFormat;
  // ... more options
}
```

## Best Practices

1. **Type Safety** - Use TypeScript generics for context and metadata
2. **Schema Validation** - Use Zod for robust input/output validation  
3. **Error Handling** - Wrap component execution in try-catch blocks
4. **Token Management** - Provide `estimateTokens` for accurate trimming
5. **Tool Organization** - Group related tools in agents
6. **Testing** - Unit test tools and prompts independently
7. **Documentation** - Document template variables and schemas
8. **Context Minimization** - Pass only necessary data in context
9. **Streaming** - Use streaming for better UX with long responses
10. **Validation** - Use `validate` hooks for business logic validation

## Examples

See the `src/__tests__` directory for comprehensive examples:

- **prompt-core-features.test.ts** - Basic prompt usage
- **prompt-streaming-tool-events.test.ts** - Streaming and events
- **tool.test.ts** - Tool creation and usage
- **agent.test.ts** - Agent orchestration
- **context-propagation.test.ts** - Context handling

## TypeScript Support

Full type inference across component hierarchies:

```typescript
// Types are automatically inferred
const prompt = new Prompt({
  name: 'example',
  schema: z.object({ result: z.string() })
  // ...
});

// TypeScript knows the output type
const output = await prompt.get({}); // { result: string }

// Tool parameters are type-safe
const tool = new Tool({
  name: 'math',
  schema: z.object({ a: z.number(), b: z.number() }),
  call: (input, refs, ctx) => {
    // input is typed as { a: number, b: number }
    return input.a + input.b;
  }
});
```

## Contributing

Contributions are welcome! See the main [@aeye repository](https://github.com/ClickerMonkey/aeye) for contribution guidelines.

## License

GPL-3.0 © [ClickerMonkey](https://github.com/ClickerMonkey)

## Links

- [GitHub Repository](https://github.com/ClickerMonkey/aeye)
- [Documentation](https://github.com/ClickerMonkey/aeye/tree/main/packages/core)
- [Issue Tracker](https://github.com/ClickerMonkey/aeye/issues)
