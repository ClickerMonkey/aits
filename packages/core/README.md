# @aits/core

Core primitives for building composable AI systems with TypeScript. @aits (AI TypeScript) provides a type-safe, modular framework for creating agents, tools, and prompts that work together seamlessly.

## Overview

`@aits/core` is a foundational package that provides the building blocks for creating sophisticated AI applications. It offers three primary component types that can be composed together:

- **Prompts**: Interact with AI models to generate responses
- **Tools**: Extend AI capabilities with custom functions and external APIs
- **Agents**: Orchestrate complex workflows by combining prompts and tools

All components are fully type-safe, support streaming, and can be nested to create powerful AI systems.

## Key Features

- **Type-Safe Composition**: Full TypeScript support with type inference across component hierarchies
- **Streaming Support**: First-class support for streaming AI responses and tool execution
- **Flexible Tool System**: Easy integration of external APIs, databases, and custom logic
- **Smart Context Management**: Automatic token management and conversation history trimming
- **Schema Validation**: Built-in Zod integration for input/output validation
- **Handlebars Templates**: Dynamic prompt generation with template variables
- **Event System**: Track execution, monitor performance, and debug component interactions
- **Provider Agnostic**: Works with any AI provider (OpenAI, Anthropic, etc.)

## Installation

```bash
npm install @aits/core zod handlebars
```

## Architecture

### Component Model

The core architecture is based on the `Component` interface, which all AI primitives implement:

```typescript
interface Component<TContext, TMetadata, TName, TInput, TOutput, TRefs> {
  kind: string;                    // 'prompt', 'tool', or 'agent'
  name: TName;                     // Unique identifier
  description: string;             // Human-readable description
  refs: TRefs;                     // Referenced components
  run(input, ctx): TOutput;        // Execute the component
  applicable(ctx): Promise<boolean>; // Check if usable in context
}
```

This unified interface allows components to be composed in any combination, enabling powerful patterns like:
- Tools that call other tools
- Prompts that use multiple tools
- Agents that orchestrate prompts and tools
- Nested component hierarchies

### Context and Execution

Components execute within a `Context` that provides:
- **Messages**: Conversation history
- **Executor/Streamer**: AI model integration
- **Signal**: Cancellation support
- **Runner**: Custom execution hooks for monitoring and control

### Type System

@aits uses advanced TypeScript features to provide:
- Type inference across component hierarchies
- Compile-time validation of component composition
- Type-safe tool parameters and outputs
- Context and metadata type propagation

## Getting Started

### 1. Basic Prompt

Create a simple prompt that summarizes text:

```typescript
import { Prompt } from '@aits/core';
import z from 'zod';

const summarizer = new Prompt({
  name: 'summarize',
  description: 'Summarizes text concisely',
  content: 'Summarize the following text in 2-3 sentences:\n\n{{text}}',
  input: (input) => ({ text: input.text }),
  schema: z.object({
    summary: z.string().describe('A concise summary')
  }),
});

// Execute the prompt
const result = await summarizer.get(
  { text: 'Long article text here...' },
  'result',
  {
    execute: yourAIExecutor // Provide your AI model executor
  }
);

console.log(result.summary);
```

### 2. Creating Tools

Tools extend AI capabilities with custom logic:

```typescript
import { Tool } from '@aits/core';
import z from 'zod';

const weatherTool = new Tool({
  name: 'getWeather',
  description: 'Get current weather for a location',
  instructions: 'Use this tool to get weather information for {{location}}',
  schema: z.object({
    location: z.string().describe('City name or ZIP code'),
    units: z.enum(['celsius', 'fahrenheit']).default('celsius')
  }),
  call: async (input) => {
    const response = await fetch(
      `https://api.weather.com/v1/location/${input.location}/observations.json`
    );
    const data = await response.json();
    return `Current weather in ${input.location}: ${data.temp}°${input.units === 'celsius' ? 'C' : 'F'}, ${data.condition}`;
  }
});
```

### 3. Prompts with Tools

Combine prompts with tools for enhanced capabilities:

```typescript
const travelAdvisor = new Prompt({
  name: 'travelAdvisor',
  description: 'Provides travel advice based on current weather',
  content: `You are a travel advisor. Help the user plan their trip to {{destination}}.

Consider the current weather and provide recommendations for:
- What to pack
- Activities to do
- Best time of day to explore`,
  input: (input) => ({ destination: input.destination }),
  tools: [weatherTool],
  schema: z.object({
    recommendations: z.array(z.string()),
    packing_list: z.array(z.string()),
    weather_notes: z.string()
  })
});

// The AI will automatically use the weather tool
const advice = await travelAdvisor.get(
  { destination: 'Paris' },
  'result',
  { execute: yourAIExecutor }
);
```

### 4. Streaming Responses

Stream content as it's generated:

```typescript
// Stream text content
for await (const chunk of summarizer.get(
  { text: 'Long text...' },
  'streamContent',
  { stream: yourAIStreamer }
)) {
  process.stdout.write(chunk);
}

// Stream all events (including tool calls)
for await (const event of summarizer.get(
  { text: 'Long text...' },
  'stream',
  { stream: yourAIStreamer }
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

### 5. Building Agents

Agents orchestrate multiple components:

```typescript
import { Agent } from '@aits/core';

const researchAgent = new Agent({
  name: 'researcher',
  description: 'Conducts comprehensive research on topics',
  refs: [searchTool, summarizeTool, analyzePrompt],
  call: async (input, [search, summarize, analyze], ctx) => {
    // Search for information
    const searchResults = await search.run(
      { query: input.topic, limit: 5 },
      ctx
    );

    // Summarize findings
    const summaries = [];
    for (const result of searchResults) {
      const summary = await summarize.get(
        { text: result.content },
        'result',
        ctx
      );
      summaries.push(summary);
    }

    // Analyze and synthesize
    const analysis = await analyze.get(
      {
        topic: input.topic,
        sources: summaries
      },
      'result',
      ctx
    );

    return analysis;
  }
});

// Execute the agent
const research = await researchAgent.run(
  { topic: 'Quantum Computing Applications' },
  { execute: yourAIExecutor }
);
```

## Advanced Features

### Context-Aware Tools

Tools can adapt based on context:

```typescript
const dynamicTool = new Tool({
  name: 'contextAware',
  description: 'A tool that adapts to context',
  instructions: 'Use this tool...',
  schema: (ctx) => {
    // Return different schemas based on context
    if (ctx.userRole === 'admin') {
      return z.object({
        action: z.enum(['read', 'write', 'delete'])
      });
    }
    return z.object({
      action: z.enum(['read'])
    });
  },
  applicable: (ctx) => {
    // Only available if user is authenticated
    return ctx.isAuthenticated === true;
  },
  call: async (input, refs, ctx) => {
    // Implementation...
  }
});
```

### Custom Validation

Add business logic validation:

```typescript
const orderTool = new Tool({
  name: 'placeOrder',
  description: 'Place an order',
  schema: z.object({
    itemId: z.string(),
    quantity: z.number().min(1)
  }),
  validate: async (input, ctx) => {
    // Custom validation logic
    const inventory = await checkInventory(input.itemId);
    if (inventory < input.quantity) {
      throw new Error(`Only ${inventory} items available`);
    }
  },
  call: async (input) => {
    // Place order...
  }
});
```

### Event Tracking

Monitor component execution:

```typescript
import { withEvents } from '@aits/core';

const runner = withEvents({
  onStatus: (instance) => {
    console.log(`${instance.component.name}: ${instance.status}`);
    if (instance.status === 'completed') {
      console.log(`Took ${instance.completed - instance.started}ms`);
    }
  },
  onPromptEvent: (instance, event) => {
    if (event.type === 'usage') {
      console.log('Tokens used:', event.usage);
    }
  }
});

const result = await prompt.get(
  { text: 'Hello' },
  'result',
  {
    execute: yourAIExecutor,
    runner
  }
);
```

### Token Management

Automatic conversation trimming when limits are reached:

```typescript
const context = {
  execute: yourAIExecutor,
  messages: conversationHistory,
  defaultCompletionTokens: 2048,
  estimateTokens: (message) => {
    // Provide token estimation for your model
    return message.content.length / 4; // Rough estimate
  }
};

// Prompt will automatically trim messages if token limit is exceeded
const result = await prompt.get({ text: 'Query' }, 'result', context);
```

### Prompt Reconfiguration

Dynamically adjust prompt behavior:

```typescript
const adaptivePrompt = new Prompt({
  name: 'adaptive',
  description: 'Adapts based on execution',
  content: 'Solve this problem: {{problem}}',
  schema: z.object({ solution: z.string() }),
  reconfig: (stats, ctx) => {
    // Adjust based on tool success rate
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

### Core Types

#### `Component<TContext, TMetadata, TName, TInput, TOutput, TRefs>`
Base interface for all AI components.

#### `Context<TContext, TMetadata>`
Execution context containing messages, executors, and configuration.

#### `Request`
AI request parameters including temperature, max tokens, tools, etc.

#### `Response`
Complete AI response with content, tool calls, and usage statistics.

#### `Message`
Message in conversation with role, content, and metadata.

#### `ToolDefinition`
Tool definition with name, description, and parameter schema.

### Component Classes

#### `Prompt<TContext, TMetadata, TName, TInput, TOutput, TTools>`
Generates AI responses with optional tool usage.

**Methods:**
- `get(input, mode?, ctx?)`: Execute and retrieve output
- `run(input, ctx)`: Execute with full streaming
- `applicable(ctx)`: Check if prompt can run in context

**Modes:**
- `'result'`: Return final output
- `'tools'`: Return tool outputs
- `'stream'`: Stream all events
- `'streamTools'`: Stream tool outputs
- `'streamContent'`: Stream text content

#### `Tool<TContext, TMetadata, TName, TParams, TOutput, TRefs>`
Extends AI capabilities with custom functions.

**Methods:**
- `run(input, ctx)`: Execute the tool
- `compile(ctx)`: Generate tool definition for AI
- `parse(ctx, args)`: Parse and validate arguments
- `applicable(ctx)`: Check if tool can run in context

#### `Agent<TContext, TMetadata, TName, TInput, TOutput, TRefs>`
Orchestrates complex workflows with multiple components.

**Methods:**
- `run(input, ctx)`: Execute the agent
- `applicable(ctx)`: Check if agent can run in context

### Utility Functions

#### `resolve(input)`
Resolves promises, values, and async generators uniformly.

#### `resolveFn(fn)`
Converts flexible function types into standardized async functions.

#### `withEvents(events)`
Creates a runner that emits execution events.

#### `consumeAll(generator)`
Consumes all values from an async generator.

#### `yieldAll(promises)`
Yields promises as they settle, maintaining indices.

## TypeScript Support

@aits is built with TypeScript and provides excellent type inference:

```typescript
// Types are inferred automatically
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
  call: (input) => {
    // input is typed as { a: number, b: number }
    return input.a + input.b;
  }
});
```

## Best Practices

1. **Use Descriptive Names**: Component names should clearly indicate their purpose
2. **Validate Inputs**: Use Zod schemas for robust input validation
3. **Handle Errors**: Wrap component execution in try-catch blocks
4. **Monitor Performance**: Use event tracking to identify bottlenecks
5. **Manage Context**: Pass only necessary data in context to minimize overhead
6. **Test Components**: Unit test tools and prompts independently
7. **Version Schemas**: Keep backward compatibility when updating schemas
8. **Document Templates**: Comment complex Handlebars templates
9. **Reuse Components**: Build a library of reusable tools and prompts
10. **Type Safety**: Leverage TypeScript for compile-time validation

## Examples

Check out the examples directory for complete working examples:

- **Simple Chatbot**: Basic conversational AI
- **Research Assistant**: Multi-step research with tools
- **Code Reviewer**: Analyzes and suggests improvements
- **Data Analyzer**: Processes and visualizes data
- **Content Generator**: Creates structured content

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

## License

MIT © ClickerMonkey

## Links

- [GitHub Repository](https://github.com/ClickerMonkey/aits)
- [Documentation](https://github.com/ClickerMonkey/aits/tree/main/packages/core)
- [Issue Tracker](https://github.com/ClickerMonkey/aits/issues)
