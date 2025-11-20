# @aeye/ai

> **Multi-provider AI library with intelligent model selection, type-safe context management, and comprehensive hooks system.**

The `@aeye/ai` package is the main AI library built on `@aeye/core`, providing a unified interface for working with multiple AI providers (OpenAI, Anthropic, Google, etc.) with automatic model selection, cost tracking, and extensible architecture.

```ts
const ai = AI.with<MyContext>()
  .providers({ openai })
  .create(/* options, hooks, etc */)

ai.chat.get(request, ctx?)
ai.chat.stream(request, ctx?)
ai.image.generate.get(request, ctx?)
ai.image.generate.stream(request, ctx?)
ai.image.edit.get(request, ctx?)
ai.image.edit.stream(request, ctx?)
ai.image.analyze.get(request, ctx?)
ai.image.analyze.stream(request, ctx?)
ai.transcribe.get(request, ctx?)
ai.transcribe.stream(request, ctx?)
ai.speech.get(request, ctx?)
ai.speech.stream(request, ctx?)
ai.embed.get(request, ctx?)
ai.embed.stream(request, ctx?)
ai.models.list() // get(id), search(criteria), select(criteria), refresh()
ai.providers.openai // Provider
ai.hooks // Hook events to implement BYOK
ai.components // all prompts/tools/agents created on this ai

// Define prompts, tools, agents
const chatPrompt = ai.prompt({
  name: 'chat_prompt',
  description: 'A helpful chat assistant that answers user questions',
  content: `You are a helpful assistant. The user {{user}} has asked: {{question}}
Answer their question clearly and concisely. If you need more information, use the available tools.`,
  input: (input: { user: string; question: string }) => input,
  schema: z.object({ answer: z.string() }),
  refs: [relevantInfo],
});

const analyzeConversation = ai.prompt({
  name: 'analyze_conversation',
  description: 'Analyzes a conversation to judge how accurately the agent performed the requests',
  content: `You are a conversational analyst. Analyze the following conversation between user {{user}} and the assistant.
Messages: {{messages}}
Return a summary of how well the agent performed and a rating between 0 and 100.`,
  input: (input: { user: string; messages: string }) => input,
  schema: z.object({ summary: z.string(), rating: z.number() }),
});

// Tool
const relevantInfo = ai.tool({
  name: 'relevant_info',
  description: `Searches for info relevant to a user's question`,
  instructions: 'Use the relevant_info tool to look up information to better answer questions',
  schema: z.object({
    query: z.string(),
  }),
  call: async ({ query }, refs, ctx) => {
    return await DB.getRelevantInfo(query, 10);
  }
});

// Agent
const chatAgent = ai.agent({
  name: 'chat_agent',
  description: 'An agent to chat with the user and analyze the conversation',
  refs: [relevantInfo, chatPrompt, analyzeConversation],
  call: async (input: { user: string; question: string }, refs, ctx) => {
    // Get the chat response
    const chatResponse = await refs[1].run({
      user: input.user,
      question: input.question
    }, ctx);

    // Analyze the conversation
    const messages = JSON.stringify([
      { role: 'user', content: input.question },
      { role: 'assistant', content: chatResponse.answer }
    ]);

    const analysis = await refs[2].run({
      user: input.user,
      messages
    }, ctx);

    return {
      answer: chatResponse.answer,
      analysis: {
        summary: analysis.summary,
        rating: analysis.rating
      }
    };
  },
});

// Use the agent
const result = await chatAgent.run(
  { user: 'ClickerMonkey', question: 'What is TypeScript?' },
  { messages: [] }
);
console.log(result.answer);
console.log(`Quality rating: ${result.analysis.rating}/100`);
```

## Features

- **Multi-Provider Support**: Single interface for OpenAI, Anthropic, Google, Replicate, and custom providers
- **Intelligent Model Selection**: Automatic model selection based on capabilities, cost, speed, and quality
- **Type-Safe Context**: Strongly-typed context and metadata with compiler validation
- **Comprehensive APIs**: Chat, Image Generation/Analysis, Speech Synthesis/Transcription, Embeddings
- **Lifecycle Hooks**: Intercept and modify operations at every stage
- **Cost Tracking**: Automatic token usage and cost calculation
- **Streaming Support**: Full streaming support across all compatible capabilities
- **Model Registry**: Centralized model management with external sources (OpenRouter, etc.)
- **Extensible**: Custom providers, model handlers, and transformers

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
  - [Chat API](#chat-api)
  - [Image API](#image-api)
  - [Speech API](#speech-api)
  - [Transcribe API](#transcribe-api)
  - [Embed API](#embed-api)
  - [Models API](#models-api)
- [Advanced Features](#advanced-features)
  - [Custom Context & Metadata](#custom-context--metadata)
  - [Lifecycle Hooks](#lifecycle-hooks)
  - [Model Selection](#model-selection)
  - [Model Sources](#model-sources)
  - [Custom Providers](#custom-providers)
- [TypeScript Guide](#typescript-guide)
- [Examples](#examples)

## Installation

```bash
npm install @aeye/ai @aeye/core
```

You'll also need provider packages:

```bash
npm install @aeye/openai @aeye/anthropic  # etc.
```

## Quick Start

```typescript
import { AI } from '@aeye/ai';
import { OpenAIProvider } from '@aeye/openai';
import { OpenRouterProvider } from '@aeye/openrouter';

// Create providers
const openai = new OpenAIProvider({ apiKey: '123' });
const openrouter = new OpenRouterProvider({ apiKey: 'abc' });

// Create an AI instance
const ai = AI.with()
  .providers({ openai, openrouter })
  .create({
    defaultContext: {
      apiVersion: 'v1'
    }
  });

// Simple chat completion
const response = await ai.chat.get([
  { role: 'user', content: 'What is TypeScript?' }
]);
console.log(response.content);

// Streaming
for await (const chunk of ai.chat.stream([
  { role: 'user', content: 'Write a poem' }
])) {
  if (chunk.content) {
    process.stdout.write(chunk.content);
  }
}
```

## Architecture

The `@aeye/ai` library is structured around several key components:

```
┌─────────────────────────────────────────────────────────┐
│                        AI Class                         │
│  - Context Management                                   │
│  - Model Registry                                       │
│  - Lifecycle Hooks                                      │
└─────────────────┬───────────────────────────────────────┘
                  │
         ┌────────┴─────────┐
         │                  │
    ┌────▼────┐      ┌─────▼──────┐
    │  APIs   │      │  Registry  │
    │         │      │            │
    │ • Chat  │      │ • Models   │
    │ • Image │      │ • Search   │
    │ • Speech│      │ • Select   │
    │ • Embed │      └────┬───────┘
    └────┬────┘           │
         │         ┌──────▼──────┐
         │         │  Providers  │
         │         │             │
         │         │ • OpenAI    │
         │         │ • Anthropic │
         │         │ • Google    │
         │         │ • Custom    │
         └─────────┴─────────────┘
```

### Key Components

1. **AI Class**: Central orchestrator managing context, metadata, providers, and APIs
2. **APIs**: Specialized interfaces for different capabilities (chat, images, speech, etc.)
3. **Model Registry**: Centralized model management with selection logic
4. **Providers**: Pluggable implementations for different AI services
5. **Context System**: Type-safe context and metadata threading

## Core Concepts

### Context

Context is data passed through your entire AI operation. It's composed of:

- **Default Context**: Static values provided at AI creation
- **Provided Context**: Async-loaded values (e.g., from database)
- **Required Context**: Values that must be provided per-request

```typescript
interface AppContext {
  user: User;
  db: Database;
  apiVersion: string;
}

const ai = AI.with<AppContext>()
  .providers({ openai })
  .create({
    defaultContext: {
      apiVersion: 'v1'
    },
    providedContext: async (ctx) => ({
      user: await getUser(ctx.userId),
      db: database
    })
  });

// Usage: only provide what's not already available
await ai.chat.get(request, { userId: '123' });
```

### Metadata

Metadata controls model selection and operation configuration:

```typescript
interface AppMetadata {
  priority: 'cost' | 'speed' | 'quality';
}

const ai = AI.with<AppContext, AppMetadata>()
  .providers({ openai, openrouter })
  .create({
    defaultMetadata: {
      priority: 'balanced'
    }
  });

// Override per request
await ai.chat.get(request, {
  metadata: {
    model: 'gpt-4',  // Specific model
    required: ['chat', 'vision'],  // Required capabilities
    weights: { cost: 0.7, speed: 0.3 }  // Selection weights
  }
});
```

### Model Selection

Models are automatically selected based on:

1. **Capabilities**: Required and optional features
2. **Constraints**: Provider filters, context window, budget
3. **Scoring**: Weighted evaluation of cost, speed, accuracy, context size

```typescript
// Automatic selection for vision task
const response = await ai.chat.get(
  [{
    role: 'user',
    content: [
      { type: 'text', content: 'What is in this image?' },
      { type: 'image', content: imageUrl }
    ]
  }],
  {
    metadata: {
      required: ['chat', 'vision'],
      weights: { cost: 0.5, speed: 0.5 }
    }
  }
);
```

## API Reference

### Chat API

The Chat API provides conversational AI with automatic model selection.

#### Methods

**`chat.get(messages, context?)`**

Execute a non-streaming chat completion.

```typescript
const response = await ai.chat.get([
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Hello!' }
]);

console.log(response.content);
console.log(response.usage);  // Token usage
console.log(response.finishReason);
```

**`chat.stream(messages, context?)`**

Execute a streaming chat completion.

```typescript
for await (const chunk of ai.chat.stream([
  { role: 'user', content: 'Count to 10' }
])) {
  if (chunk.content) {
    process.stdout.write(chunk.content);
  }
  if (chunk.finishReason) {
    console.log('\nFinished:', chunk.finishReason);
  }
}
```

#### Request Format

```typescript
interface Request {
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  tools?: Tool[];
  responseFormat?: { type: 'json_object' | 'text' };
  // ... other options
}

type Message =
  | { role: 'system' | 'user' | 'assistant', content: string }
  | { role: 'user', content: ContentPart[] };  // Multimodal

type ContentPart =
  | { type: 'text', content: string }
  | { type: 'image', content: string };  // URL or base64
```

#### Response Format

```typescript
interface Response {
  content: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  toolCalls?: ToolCall[];
  refusal?: string;
  reasoning?: string;  // For reasoning models
  usage: Usage;
}

interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  cost?: number;  // Cost in dollars, if provided by the provider
}
```

#### Examples

**Basic Conversation**

```typescript
const messages = [
  { role: 'system', content: 'You are a TypeScript expert.' },
  { role: 'user', content: 'Explain generics' }
];

const response = await ai.chat.get(messages);
console.log(response.content);
```

**Vision Analysis**

```typescript
const response = await ai.chat.get([
  {
    role: 'user',
    content: [
      { type: 'text', content: 'What is in this image?' },
      { type: 'image', content: 'https://example.com/image.jpg' }
    ]
  }
], {
  metadata: {
    required: ['chat', 'vision']
  }
});
```

**Function Calling**

```typescript
const tools = [
  {
    name: 'get_weather',
    description: 'Get weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string' }
      }
    }
  }
];

const response = await ai.chat.get(
  [{ role: 'user', content: 'What is the weather in NYC?' }],
  {
    metadata: {
      required: ['chat', 'tools']
    }
  }
);

if (response.toolCalls) {
  for (const call of response.toolCalls) {
    console.log(`Tool: ${call.function.name}`);
    console.log(`Args: ${call.function.arguments}`);
  }
}
```

**Streaming with Token Counting**

```typescript
let totalTokens = 0;

for await (const chunk of ai.chat.stream(messages)) {
  if (chunk.content) {
    process.stdout.write(chunk.content);
  }
  if (chunk.usage) {
    totalTokens = chunk.usage.totalTokens;
  }
}

console.log(`\nTotal tokens: ${totalTokens}`);
```

### Image API

The Image API provides image generation, editing, and analysis.

#### Sub-APIs

**`image.generate.get(request, context?)`**

Generate images from text prompts.

```typescript
const response = await ai.image.generate.get({
  prompt: 'A futuristic city at sunset',
  n: 2,
  size: '1024x1024',
  quality: 'hd'
});

for (const image of response.images) {
  console.log(image.url);
}
```

**`image.generate.stream(request, context?)`**

Stream image generation progress.

```typescript
for await (const chunk of ai.image.generate.stream({
  prompt: 'A majestic mountain landscape'
})) {
  if (chunk.progress) {
    console.log(`Progress: ${chunk.progress}%`);
  }
  if (chunk.done && chunk.image) {
    console.log('Image URL:', chunk.image.url);
  }
}
```

**`image.edit.get(request, context?)`**

Edit existing images with prompts.

```typescript
const response = await ai.image.edit.get({
  image: imageBuffer,
  mask: maskBuffer,
  prompt: 'Add a sunset in the background',
  size: '1024x1024'
});
```

**`image.analyze.get(request, context?)`**

Analyze images with vision models (uses chat models with vision capability).

```typescript
const response = await ai.image.analyze.get({
  prompt: 'Describe this image in detail',
  images: ['https://example.com/photo.jpg'],
  maxTokens: 500
});

console.log(response.content);
```

#### Examples

**Batch Generation**

```typescript
const response = await ai.image.generate.get({
  prompt: 'Logo designs for a tech startup',
  n: 4,
  size: '512x512'
});

response.images.forEach((img, i) => {
  console.log(`Design ${i + 1}: ${img.url}`);
});
```

**Style Transfer**

```typescript
const response = await ai.image.generate.get({
  prompt: 'Van Gogh style starry night over modern city',
  quality: 'hd',
  style: 'vivid'
});
```

### Speech API

Text-to-speech synthesis.

**`speech.get(request, context?)`**

```typescript
const response = await ai.speech.get({
  text: 'Hello, this is a test of text to speech.',
  voice: 'alloy',
  speed: 1.0,
  responseFormat: 'mp3'
});

// Save audio
fs.writeFileSync('output.mp3', response.audioBuffer);
```

**`speech.stream(request, context?)`**

```typescript
for await (const chunk of ai.speech.stream({
  text: 'Streaming audio generation...',
  voice: 'nova'
})) {
  if (chunk.audioData) {
    // Process audio chunks in real-time
    audioStream.write(chunk.audioData);
  }
}
```

### Transcribe API

Speech-to-text transcription.

**`transcribe.get(request, context?)`**

```typescript
const audioBuffer = fs.readFileSync('recording.mp3');

const response = await ai.transcribe.get({
  audio: audioBuffer,
  language: 'en',
  responseFormat: 'verbose_json',
  timestampGranularities: ['word', 'segment']
});

console.log(response.text);
console.log('Words:', response.words);
console.log('Segments:', response.segments);
```

### Embed API

Generate text embeddings for semantic search and similarity.

**`embed.get(request, context?)`**

```typescript
const response = await ai.embed.get({
  texts: [
    'TypeScript is a typed superset of JavaScript',
    'Python is a high-level programming language',
    'Rust is a systems programming language'
  ],
  dimensions: 1536
});

// Get embeddings
response.embeddings.forEach(({ embedding, index }) => {
  console.log(`Text ${index}: ${embedding.length} dimensions`);
});

// Calculate similarity
function cosineSimilarity(a: number[], b: number[]) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
}

const sim = cosineSimilarity(
  response.embeddings[0].embedding,
  response.embeddings[1].embedding
);
console.log('Similarity:', sim);
```

### Models API

Explore and manage available models.

**`models.list()`**

```typescript
const models = ai.models.list();
console.log(`Available models: ${models.length}`);

models.forEach(model => {
  console.log(`${model.provider}/${model.id}`);
  console.log(`  Tier: ${model.tier}`);
  console.log(`  Capabilities: ${Array.from(model.capabilities).join(', ')}`);
  console.log(`  Cost: $${model.pricing.inputTokensPer1M}/1M input tokens`);
});
```

**`models.get(id)`**

```typescript
const model = ai.models.get('gpt-4');
if (model) {
  console.log('Context window:', model.contextWindow);
  console.log('Max output:', model.maxOutputTokens);
}
```

**`models.search(criteria)`**

```typescript
const results = ai.models.search({
  required: ['chat', 'structured'],
  optional: ['vision'],
  weights: { cost: 0.6, speed: 0.4 },
  providers: { allow: ['openai', 'anthropic'] },
  minContextWindow: 100000
});

console.log('Best match:', results[0].model.id);
console.log('Score:', results[0].score);
```

**`models.refresh()`**

```typescript
console.log('Refreshing models...');
await ai.models.refresh();
console.log(`Now have ${ai.models.list().length} models`);
```

## Advanced Features

### Custom Context & Metadata

Define your application-specific context and metadata types:

```typescript
interface AppContext {
  user: User;
  organization: Organization;
  db: Database;
  requestId: string;
}

interface AppMetadata {
  priority: 'low' | 'normal' | 'high';
  category: 'support' | 'sales' | 'internal';
  maxCost: number;
}

const ai = AI.with<AppContext, AppMetadata>()
  .providers({ openai, anthropic })
  .create({
    defaultContext: {
      requestId: uuid()
    },
    providedContext: async (ctx) => {
      // Load from database
      const user = await db.users.findById(ctx.userId);
      const org = await db.orgs.findById(user.organizationId);
      return { user, organization: org, db };
    },
    defaultMetadata: {
      priority: 'normal',
      maxCost: 0.10
    }
  });

// Use with minimal input
const response = await ai.chat.get(messages, {
  userId: '123',  // Rest is loaded automatically
  metadata: {
    priority: 'high',
    category: 'support'
  }
});
```

### Lifecycle Hooks

Intercept and modify AI operations at key points:

```typescript
const ai = AI.with<AppContext, AppMetadata>()
  .providers({ openai, anthropic })
  .create({
    // ... config
  })
  .withHooks({
    beforeModelSelection: async (ctx, metadata) => {
      // Adjust selection based on user tier
      if (ctx.user.tier === 'free') {
        return {
          ...metadata,
          weights: { cost: 1.0, speed: 0 }  // Prioritize cost
        };
      }
      return metadata;
    },

    onModelSelected: async (ctx, selected) => {
      console.log(`Selected: ${selected.model.id}`);

      // Override model for specific users
      if (ctx.user.betaTester && selected.model.id === 'gpt-4') {
        return {
          ...selected,
          model: ai.models.get('gpt-4-turbo')!
        };
      }
    },

    beforeRequest: async (ctx, request, selected, estimatedTokens, estimatedCost) => {
      const estimatedCost = estimatedTokens / 1_000_000 *
        (selected.model.pricing.inputTokensPer1M + selected.model.pricing.outputTokensPer1M) / 2;

      // Check budget
      if (estimatedCost > ctx.user.remainingBudget) {
        throw new Error('Insufficient budget');
      }

      // Log request
      await db.logs.create({
        userId: ctx.user.id,
        model: selected.model.id,
        estimatedTokens,
        estimatedCost,
        timestamp: new Date()
      });
    },

    afterRequest: async (ctx, request, response, responseComplete, selected, usage, cost) => {
      // Track actual usage
      await db.users.update(ctx.user.id, {
        tokensUsed: usage.totalTokens,
        costAccrued: cost,
        remainingBudget: ctx.user.remainingBudget - cost
      });

      // Update model metrics
      await db.modelMetrics.increment(selected.model.id, {
        requestCount: 1,
        successCount: 1,
        totalTokens: usage.totalTokens,
        totalCost: cost
      });
    },

    onError: (type, message, error, ctx) => {
      logger.error('AI Error', {
        type,
        message,
        error,
        userId: ctx?.user?.id,
        stack: error?.stack
      });

      // Send to monitoring
      monitoring.captureException(error, {
        tags: { type, userId: ctx?.user?.id }
      });
    }
  });
```

### Model Selection

Fine-tune model selection with weights and constraints:

```typescript
// Cost-optimized
await ai.chat.get(messages, {
  metadata: {
    weights: {
      cost: 0.9,
      speed: 0.05,
      accuracy: 0.05
    }
  }
});

// Performance-optimized
await ai.chat.get(messages, {
  metadata: {
    weights: {
      cost: 0.1,
      speed: 0.5,
      accuracy: 0.4
    },
    minContextWindow: 128000
  }
});

// Provider-specific
await ai.chat.get(messages, {
  metadata: {
    providers: {
      allow: ['anthropic'],  // Only use Anthropic models
      deny: ['replicate']    // Exclude Replicate
    }
  }
});

// Budget-constrained
await ai.chat.get(messages, {
  metadata: {
    budget: {
      maxCostPerRequest: 0.05,
      maxCostPerMillionTokens: 10.0
    }
  }
});
```

#### Selection Profiles

Use pre-configured profiles:

```typescript
const ai = AI.with()
  .providers({ openai, anthropic })
  .create({
    profiles: {
      costPriority: { cost: 0.9, speed: 0.1 },
      balanced: { cost: 0.5, speed: 0.3, accuracy: 0.2 },
      performance: { cost: 0.1, speed: 0.5, accuracy: 0.4 }
    }
  });

// Reference profile in metadata
await ai.chat.get(messages, {
  metadata: {
    weights: config.profiles.costPriority
  }
});
```

### Model Sources

Enrich model information from external registries:

```typescript
import { openRouterSource } from '@aeye/openrouter';

const ai = AI.with()
  .providers({ openai, anthropic, openrouter })
  .create({
    // Use OpenRouter as a model source to get pricing/capabilities
    modelSources: [openRouterSource],

    // Or configure it explicitly
    fetchOpenRouterModels: {
      enabled: true,
      apiKey: process.env.OPENROUTER_API_KEY
    }
  });

// Models now have enriched information from OpenRouter
await ai.models.refresh();
const models = ai.models.list();
```

### Custom Providers

Create custom provider implementations:

```typescript
import { Provider } from '@aeye/ai';

const customProvider: Provider<CustomConfig> = {
  name: 'custom',
  config: {
    apiKey: process.env.CUSTOM_API_KEY,
    baseURL: 'https://api.custom.ai'
  },

  async listModels() {
    const response = await fetch(`${this.config.baseURL}/models`);
    const data = await response.json();

    return data.models.map(m => ({
      id: m.id,
      provider: 'custom',
      name: m.name,
      capabilities: new Set(['chat', 'streaming']),
      tier: 'flagship',
      pricing: {
        inputTokensPer1M: m.pricing.input,
        outputTokensPer1M: m.pricing.output
      },
      contextWindow: m.context_length
    }));
  },

  async checkHealth() {
    try {
      await fetch(`${this.config.baseURL}/health`);
      return true;
    } catch {
      return false;
    }
  },

  createExecutor() {
    return async (request, ctx, metadata) => {
      const response = await fetch(`${this.config.baseURL}/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: metadata.model,
          messages: request.messages,
          max_tokens: request.maxTokens,
          temperature: request.temperature
        })
      });

      const data = await response.json();

      return {
        content: data.choices[0].message.content,
        finishReason: data.choices[0].finish_reason,
        usage: {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        }
      };
    };
  },

  createStreamer() {
    return async function* (request, ctx, metadata) {
      const response = await fetch(`${this.config.baseURL}/chat/stream`, {
        // ... similar setup with stream: true
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            yield {
              content: data.choices[0]?.delta?.content,
              finishReason: data.choices[0]?.finish_reason,
              usage: data.usage
            };
          }
        }
      }
    };
  }
};

// Use custom provider
const ai = AI.with()
  .providers({ custom: customProvider, openai })
  .create({});
```

## TypeScript Guide

### Type Safety

The library provides full TypeScript support with generic type inference:

```typescript
// Define your types
interface MyContext {
  userId: string;
  sessionId: string;
}

interface MyMetadata {
  priority: 'low' | 'high';
}

// Create strongly-typed AI instance
const ai = AI.with<MyContext, MyMetadata>()
  .providers({ openai })
  .create({
    defaultContext: {
      sessionId: 'default'  // ✓ Valid
      // foo: 'bar'         // ✗ TypeScript error
    }
  });

// Type-safe usage
await ai.chat.get(messages, {
  userId: '123',           // ✓ Required (not in default)
  sessionId: 'override',   // ✓ Optional (in default)
  // invalidField: 'x'     // ✗ TypeScript error
  metadata: {
    priority: 'high'       // ✓ Valid enum value
    // priority: 'medium'  // ✗ TypeScript error
  }
});
```

### Extending AI Instances

Create extended instances for specific use cases:

```typescript
// Base AI instance
const baseAI = AI.with<BaseContext>()
  .providers({ openai, anthropic })
  .create({ /* ... */ });

// Extended for chat feature
interface ChatContext extends BaseContext {
  chat: Chat;
  chatMessage: ChatMessage;
}

const chatAI = baseAI.extend<ChatContext>({
  defaultContext: {
    // chat and chatMessage will be provided per-request
  },
  modelOverrides: [
    {
      modelPattern: /gpt/,
      overrides: {
        pricing: { /* custom pricing */ }
      }
    }
  ]
});

// Use extended instance
await chatAI.chat.get(messages, {
  chat,
  chatMessage
});
```

## Examples

### Complete Application Example

```typescript
// types.ts
export interface AppContext {
  user: User;
  organization: Organization;
  db: Database;
  cache: Redis;
  requestId: string;
}

export interface AppMetadata {
  feature: 'chat' | 'summary' | 'analysis';
  priority: 'low' | 'normal' | 'high';
  maxCost: number;
}

// ai.ts
import { AI } from '@aeye/ai';
import { openai } from '@aeye/openai';
import { anthropic } from '@aeye/anthropic';

export const ai = AI.with<AppContext, AppMetadata>()
  .providers({ openai, anthropic })
  .create({
    defaultContext: {
      requestId: () => uuid(),
      cache: redis
    },
    providedContext: async (ctx) => {
      const user = await db.users.findById(ctx.userId);
      const org = await db.organizations.findById(user.organizationId);
      return { user, organization: org, db };
    },
    defaultMetadata: {
      priority: 'normal',
      maxCost: 0.10
    },
    profiles: {
      costPriority: { cost: 0.9, speed: 0.1 },
      balanced: { cost: 0.5, speed: 0.3, accuracy: 0.2 },
      performance: { cost: 0.1, speed: 0.5, accuracy: 0.4 }
    }
  })
  .withHooks({
    beforeRequest: async (ctx, request, selected, estimatedTokens, estimatedCost) => {
      const cost = estimateCost(tokens, selected.model);
      if (cost > ctx.user.remainingBudget) {
        throw new Error('Insufficient budget');
      }
    },
    afterRequest: async (ctx, request, response, responseComplete, selected, usage, cost) => {
      await trackUsage(ctx.user.id, usage, cost);
    },
    onError: (type, message, error, ctx) => {
      logger.error({ type, message, error, userId: ctx?.user?.id });
    }
  });

// features/chat.ts
export async function handleChatMessage(
  userId: string,
  message: string
) {
  const response = await ai.chat.get(
    [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: message }
    ],
    {
      userId,
      metadata: {
        feature: 'chat',
        priority: 'normal'
      }
    }
  );

  return response.content;
}

// features/analysis.ts
export async function analyzeDocument(
  userId: string,
  document: string
) {
  const response = await ai.chat.get(
    [
      { role: 'system', content: 'You are a document analysis expert.' },
      { role: 'user', content: `Analyze this document:\n\n${document}` }
    ],
    {
      userId,
      metadata: {
        feature: 'analysis',
        priority: 'high',
        required: ['chat'],
        weights: { accuracy: 0.7, cost: 0.3 }
      }
    }
  );

  return response.content;
}
```

### Prompt Engineering with Context

```typescript
import { ai } from './ai';

const summarizer = ai.prompt({
  name: 'summarizer',
  description: 'Summarize documents',

  input: async (params: { document: string }, ctx) => {
    // Access context in prompt construction
    const userPrefs = await ctx.db.getUserPreferences(ctx.user.id);

    return [{
      role: 'system',
      content: `Summarize documents in ${userPrefs.language}.`
    }, {
      role: 'user',
      content: `Summarize:\n\n${params.document}`
    }];
  },

  config: {
    maxTokens: 500,
    temperature: 0.3
  }
});

// Use prompt
const result = await summarizer.execute(
  { document: longText },
  { userId: '123' }
);
```

### Multi-Step Agent

```typescript
const researchAgent = ai.agent({
  name: 'researcher',
  description: 'Research topics using multiple AI calls',

  call: async (input: { topic: string }, refs, ctx) => {
    // Step 1: Generate research questions
    const questions = await ai.chat.get([{
      role: 'user',
      content: `Generate 3 research questions about: ${input.topic}`
    }], ctx);

    // Step 2: Answer each question
    const answers = [];
    for (const question of parseQuestions(questions.content)) {
      const answer = await ai.chat.get([{
        role: 'user',
        content: question
      }], ctx);
      answers.push({ question, answer: answer.content });
    }

    // Step 3: Synthesize final report
    const report = await ai.chat.get([{
      role: 'user',
      content: `Create a research report from these Q&As:\n${JSON.stringify(answers, null, 2)}`
    }], ctx);

    return report.content;
  }
});

const report = await researchAgent.execute(
  { topic: 'Quantum Computing' },
  { userId: '123' }
);
```

## License

GPL-3.0

---

For more information, visit:
- GitHub: https://github.com/yourusername/aeye
- Documentation: https://aeye.dev
- Discord: https://discord.gg/aeye
