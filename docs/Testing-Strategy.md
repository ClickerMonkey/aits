# AITS Testing Strategy

Comprehensive testing plan for all packages in the AITS monorepo.

## Overview

This document outlines the testing strategy for:
- **Unit Tests**: Mock-based tests for all packages (no API calls)
- **Integration Tests**: Real API tests with environment variables
- **Multi-Provider Tests**: Cross-provider compatibility testing

## Test Stack

- **Test Runner**: Jest
- **Assertion Library**: Jest (built-in)
- **Mocking**: Jest mocks + custom mock implementations
- **Coverage**: Jest coverage reporting
- **Environment Variables**: dotenv for API keys

---

## Package Structure

```
packages/
├── core/                    # Core abstractions (executor, streamer, tools, agents, prompts)
├── ai/                      # AI orchestration layer (model selection, registry)
├── openai/                  # OpenAI provider
├── openrouter/              # OpenRouter provider
├── replicate/               # Replicate provider
├── xai/                     # xAI provider
├── google/                  # Google provider
└── test-integration/        # NEW: Multi-provider integration tests
```

---

## 1. Core Package (@aits/core)

**Location**: `packages/core/src/__tests__/`

### Test Structure

```
packages/core/src/
├── __tests__/
│   ├── mocks/
│   │   ├── executor.mock.ts      # Mock executor implementations
│   │   ├── streamer.mock.ts      # Mock streamer implementations
│   │   └── fixtures.ts           # Test fixtures (messages, responses)
│   ├── types.test.ts             # Type utility tests
│   ├── executor.test.ts          # Executor tests
│   ├── streamer.test.ts          # Streamer tests
│   ├── prompt.test.ts            # Prompt tests
│   ├── tool.test.ts              # Tool tests
│   ├── agent.test.ts             # Agent tests
│   ├── combinations.test.ts      # Complex combinations
│   └── errors.test.ts            # Error handling
```

### Test Cases

#### Mock Utilities (`__tests__/mocks/`)

```typescript
// executor.mock.ts
export const createMockExecutor = (options?: {
  response?: Response;
  error?: Error;
  delay?: number;
}): Executor<any, any> => {
  return async (request, ctx, metadata, signal) => {
    if (options?.delay) {
      await new Promise(resolve => setTimeout(resolve, options.delay));
    }
    if (options?.error) {
      throw options.error;
    }
    return options?.response || {
      content: 'Mock response',
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    };
  };
};

// streamer.mock.ts
export const createMockStreamer = (options?: {
  chunks?: Chunk[];
  error?: Error;
  delay?: number;
}): Streamer<any, any> => {
  return async function* (request, ctx, metadata, signal) {
    const chunks = options?.chunks || [
      { content: 'Hello', finishReason: null },
      { content: ' world', finishReason: null },
      { content: '!', finishReason: 'stop' }
    ];

    for (const chunk of chunks) {
      if (options?.delay) {
        await new Promise(resolve => setTimeout(resolve, options.delay));
      }
      if (signal?.aborted) {
        throw new Error('Aborted');
      }
      yield chunk;
    }

    if (options?.error) {
      throw options.error;
    }
  };
};

// fixtures.ts
export const mockMessages: Message[] = [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' }
];

export const mockRequest: Request = {
  messages: mockMessages,
  maxTokens: 100,
  temperature: 0.7
};

export const mockResponse: Response = {
  content: 'Test response',
  finishReason: 'stop',
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
};
```

#### Prompt Tests (`prompt.test.ts`)

```typescript
describe('Prompt', () => {
  describe('Basic Functionality', () => {
    it('should execute a simple prompt', async () => {
      const executor = createMockExecutor();
      const prompt = new Prompt({
        name: 'test',
        description: 'Test prompt',
        template: 'Hello {{name}}',
        execute: executor
      });

      const result = await prompt.run({ name: 'World' });
      expect(result).toBeDefined();
    });

    it('should interpolate variables', async () => {
      const executor = createMockExecutor();
      const prompt = new Prompt({
        name: 'greeting',
        template: 'Hello {{name}}, you are {{age}} years old',
        execute: executor
      });

      await prompt.run({ name: 'Alice', age: 30 });
      // Verify executor received interpolated message
    });

    it('should handle missing variables', async () => {
      const prompt = new Prompt({
        name: 'test',
        template: 'Hello {{name}}',
        execute: createMockExecutor()
      });

      expect(() => prompt.run({})).rejects.toThrow();
    });
  });

  describe('System Messages', () => {
    it('should include system message', async () => {
      const executor = jest.fn(createMockExecutor());
      const prompt = new Prompt({
        name: 'test',
        system: 'You are a helpful assistant',
        template: 'Hello',
        execute: executor
      });

      await prompt.run();
      const call = executor.mock.calls[0];
      expect(call[0].messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant'
      });
    });
  });

  describe('Streaming', () => {
    it('should stream responses', async () => {
      const streamer = createMockStreamer({
        chunks: [
          { content: 'Hello', finishReason: null },
          { content: ' world', finishReason: 'stop' }
        ]
      });

      const prompt = new Prompt({
        name: 'test',
        template: 'Say hello',
        stream: streamer
      });

      const chunks: Chunk[] = [];
      for await (const chunk of prompt.stream()) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toBe('Hello');
      expect(chunks[1].content).toBe(' world');
    });
  });

  describe('Error Handling', () => {
    it('should handle executor errors', async () => {
      const prompt = new Prompt({
        name: 'test',
        template: 'Hello',
        execute: createMockExecutor({ error: new Error('API Error') })
      });

      await expect(prompt.run()).rejects.toThrow('API Error');
    });

    it('should handle streaming errors', async () => {
      const prompt = new Prompt({
        name: 'test',
        template: 'Hello',
        stream: createMockStreamer({ error: new Error('Stream Error') })
      });

      const consume = async () => {
        for await (const chunk of prompt.stream()) {
          // consume
        }
      };

      await expect(consume()).rejects.toThrow('Stream Error');
    });
  });
});
```

#### Tool Tests (`tool.test.ts`)

```typescript
describe('Tool', () => {
  describe('Basic Functionality', () => {
    it('should define a tool with schema', () => {
      const tool = new Tool({
        name: 'calculator',
        description: 'Performs calculations',
        input: z.object({
          operation: z.enum(['add', 'subtract']),
          a: z.number(),
          b: z.number()
        }),
        run: async ({ operation, a, b }) => {
          return operation === 'add' ? a + b : a - b;
        }
      });

      expect(tool.name).toBe('calculator');
      expect(tool.schema).toBeDefined();
    });

    it('should validate input', async () => {
      const tool = new Tool({
        name: 'test',
        input: z.object({ value: z.number() }),
        run: async ({ value }) => value * 2
      });

      await expect(tool.run({ value: 'invalid' } as any))
        .rejects.toThrow();
    });

    it('should execute successfully', async () => {
      const tool = new Tool({
        name: 'multiply',
        input: z.object({ a: z.number(), b: z.number() }),
        run: async ({ a, b }) => a * b
      });

      const result = await tool.run({ a: 3, b: 4 });
      expect(result).toBe(12);
    });
  });

  describe('Context Access', () => {
    it('should receive context', async () => {
      const tool = new Tool({
        name: 'greet',
        input: z.object({ name: z.string() }),
        run: async ({ name }, ctx) => {
          return `Hello ${name}, user is ${ctx.userId}`;
        }
      });

      const result = await tool.run(
        { name: 'Alice' },
        { userId: '123' } as any
      );

      expect(result).toBe('Hello Alice, user is 123');
    });
  });

  describe('Error Handling', () => {
    it('should handle execution errors', async () => {
      const tool = new Tool({
        name: 'faulty',
        input: z.object({}),
        run: async () => {
          throw new Error('Tool failed');
        }
      });

      await expect(tool.run({})).rejects.toThrow('Tool failed');
    });
  });
});
```

#### Agent Tests (`agent.test.ts`)

```typescript
describe('Agent', () => {
  describe('Basic Functionality', () => {
    it('should create an agent with tools', async () => {
      const calculator = new Tool({
        name: 'calculator',
        input: z.object({ a: z.number(), b: z.number() }),
        run: async ({ a, b }) => a + b
      });

      const agent = new Agent({
        name: 'math-agent',
        description: 'Solves math problems',
        tools: [calculator],
        execute: createMockExecutor()
      });

      expect(agent.tools).toHaveLength(1);
    });

    it('should execute with tool calls', async () => {
      const mockExecutor = createMockExecutor({
        response: {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [{
            id: 'call_1',
            name: 'calculator',
            arguments: { a: 5, b: 3 }
          }],
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
        }
      });

      const calculator = new Tool({
        name: 'calculator',
        input: z.object({ a: z.number(), b: z.number() }),
        run: async ({ a, b }) => a + b
      });

      const agent = new Agent({
        name: 'test',
        tools: [calculator],
        execute: mockExecutor
      });

      const result = await agent.run({ messages: [{ role: 'user', content: 'Add 5 and 3' }] });
      expect(result).toBeDefined();
    });
  });

  describe('Multi-Turn Conversations', () => {
    it('should handle multiple tool calls', async () => {
      // Test agent making multiple tool calls
    });

    it('should maintain conversation history', async () => {
      // Test conversation context preservation
    });
  });

  describe('Error Handling', () => {
    it('should handle tool execution errors', async () => {
      // Test tool error handling
    });

    it('should handle max iterations', async () => {
      // Test infinite loop prevention
    });
  });
});
```

#### Complex Combinations (`combinations.test.ts`)

```typescript
describe('Complex Combinations', () => {
  describe('Prompt with Tools', () => {
    it('should use prompt with tools in agent', async () => {
      const greetingPrompt = new Prompt({
        name: 'greeting',
        template: 'Greet the user: {{name}}',
        execute: createMockExecutor()
      });

      const tool = new Tool({
        name: 'greet',
        input: z.object({ name: z.string() }),
        run: async ({ name }) => greetingPrompt.run({ name })
      });

      const agent = new Agent({
        name: 'greeter',
        tools: [tool],
        execute: createMockExecutor({
          response: {
            content: '',
            finishReason: 'tool_calls',
            toolCalls: [{
              id: 'call_1',
              name: 'greet',
              arguments: { name: 'Alice' }
            }]
          }
        })
      });

      const result = await agent.run({ messages: [] });
      expect(result).toBeDefined();
    });
  });

  describe('Nested Agents', () => {
    it('should support agent calling another agent', async () => {
      // Test agent composition
    });
  });

  describe('Prompt Chains', () => {
    it('should chain multiple prompts', async () => {
      // Test sequential prompt execution
    });
  });
});
```

---

## 2. AI Package (@aits/ai)

**Location**: `packages/ai/src/__tests__/`

### Test Structure

```
packages/ai/src/
├── __tests__/
│   ├── mocks/
│   │   ├── provider.mock.ts      # Mock provider implementations
│   │   ├── models.mock.ts        # Mock model data
│   │   └── fixtures.ts           # Test fixtures
│   ├── registry.test.ts          # Model registry tests
│   ├── selection.test.ts         # Model selection tests
│   ├── ai.test.ts                # AI class tests
│   ├── chat.test.ts              # Chat API tests
│   ├── image.test.ts             # Image API tests
│   ├── audio.test.ts             # Audio API tests
│   ├── embedding.test.ts         # Embedding API tests
│   ├── hooks.test.ts             # Lifecycle hooks tests
│   ├── context.test.ts           # Context building tests
│   └── errors.test.ts            # Error scenarios
```

### Mock Provider

```typescript
// __tests__/mocks/provider.mock.ts
export const createMockProvider = (options?: {
  name?: string;
  models?: ModelInfo[];
  capabilities?: Set<ModelCapability>;
}): Provider => {
  return {
    name: options?.name || 'mock',
    config: { apiKey: 'test-key' },
    priority: 10,

    async listModels() {
      return options?.models || mockModels;
    },

    async checkHealth() {
      return true;
    },

    createExecutor() {
      return createMockExecutor();
    },

    createStreamer() {
      return createMockStreamer();
    },

    async generateImage(request, ctx, config) {
      return {
        images: [{ url: 'https://example.com/image.png' }],
        model: request.model || 'mock-image-1',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      };
    },

    async *generateImageStream(request, ctx, config) {
      yield { status: 'generating', progress: 0.5, done: false };
      yield {
        image: { url: 'https://example.com/image.png' },
        done: true
      };
    },

    async transcribe(request, ctx, config) {
      return {
        text: 'Mock transcription',
        model: request.model || 'mock-whisper',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      };
    },

    async speech(request, ctx, config) {
      return {
        audio: new ReadableStream(),
        model: request.model || 'mock-tts',
        responseFormat: 'mp3'
      };
    },

    async embed(request, ctx, config) {
      return {
        embeddings: request.texts.map((_, i) => ({
          embedding: Array(1536).fill(0),
          index: i
        })),
        model: request.model || 'mock-embed',
        usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 }
      };
    }
  };
};

export const mockModels: ModelInfo[] = [
  {
    id: 'mock-chat-1',
    provider: 'mock',
    name: 'Mock Chat Model',
    capabilities: new Set(['chat', 'streaming']),
    tier: 'flagship',
    pricing: {
      inputTokensPer1M: 1.0,
      outputTokensPer1M: 2.0
    },
    contextWindow: 128000
  },
  {
    id: 'mock-chat-2',
    provider: 'mock',
    name: 'Mock Efficient Chat',
    capabilities: new Set(['chat', 'streaming']),
    tier: 'efficient',
    pricing: {
      inputTokensPer1M: 0.5,
      outputTokensPer1M: 1.0
    },
    contextWindow: 32000
  },
  {
    id: 'mock-image-1',
    provider: 'mock',
    name: 'Mock Image Model',
    capabilities: new Set(['image']),
    tier: 'flagship',
    pricing: {
      inputTokensPer1M: 10.0,
      outputTokensPer1M: 10.0
    },
    contextWindow: 4096
  }
];
```

### Test Cases

#### Model Selection Tests (`selection.test.ts`)

```typescript
describe('Model Selection', () => {
  let ai: AI;

  beforeEach(() => {
    const mockProvider = createMockProvider({ models: mockModels });
    ai = new AI({
      providers: { mock: mockProvider },
      defaultContext: {},
      defaultMetadata: {}
    });
    await ai.models.refresh();
  });

  describe('Capability Matching', () => {
    it('should select models with required capabilities', () => {
      const results = ai.models.search({
        required: ['chat']
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.model.capabilities.has('chat')).toBe(true);
      });
    });

    it('should reject models without required capabilities', () => {
      const results = ai.models.search({
        required: ['vision']
      });

      // Should find no models (mock models don't have vision)
      expect(results.length).toBe(0);
    });

    it('should prefer models with optional capabilities', () => {
      const results = ai.models.search({
        required: ['chat'],
        optional: ['streaming']
      });

      expect(results[0].matchedOptional).toContain('streaming');
    });
  });

  describe('Cost-Based Selection', () => {
    it('should prefer cheaper models when cost weight is high', () => {
      const results = ai.models.search({
        required: ['chat'],
        weights: { cost: 1.0, speed: 0, accuracy: 0 }
      });

      expect(results[0].model.id).toBe('mock-chat-2'); // Cheaper model
    });
  });

  describe('Provider Filtering', () => {
    it('should filter by allowed providers', () => {
      const results = ai.models.search({
        required: ['chat'],
        providers: { allow: ['mock'] }
      });

      results.forEach(result => {
        expect(result.model.provider).toBe('mock');
      });
    });

    it('should filter by denied providers', () => {
      const results = ai.models.search({
        required: ['chat'],
        providers: { deny: ['mock'] }
      });

      expect(results.length).toBe(0);
    });
  });

  describe('Explicit Model Selection', () => {
    it('should use explicitly specified model', () => {
      const selected = ai.models.select({
        model: 'mock-chat-1'
      });

      expect(selected?.model.id).toBe('mock-chat-1');
    });

    it('should return undefined for non-existent model', () => {
      const selected = ai.models.select({
        model: 'non-existent'
      });

      expect(selected).toBeUndefined();
    });
  });
});
```

#### Image API Tests (`image.test.ts`)

```typescript
describe('Image API', () => {
  let ai: AI;

  beforeEach(() => {
    const mockProvider = createMockProvider();
    ai = new AI({
      providers: { mock: mockProvider }
    });
  });

  describe('Image Generation', () => {
    it('should generate image', async () => {
      const result = await ai.image.generate.get({
        prompt: 'A beautiful landscape'
      });

      expect(result.images).toHaveLength(1);
      expect(result.images[0].url).toBeDefined();
    });

    it('should pass model from metadata', async () => {
      const result = await ai.image.generate.get(
        { prompt: 'Test' },
        { metadata: { model: 'mock-image-1' } }
      );

      expect(result.model).toBe('mock-image-1');
    });

    it('should stream image generation', async () => {
      const chunks: ImageGenerationChunk[] = [];
      for await (const chunk of ai.image.generate.stream({ prompt: 'Test' })) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[chunks.length - 1].done).toBe(true);
    });
  });

  describe('Image Editing', () => {
    it('should edit image', async () => {
      const result = await ai.image.edit.get({
        prompt: 'Make it blue',
        image: Buffer.from('fake-image')
      });

      expect(result.images).toBeDefined();
    });
  });
});
```

#### Hooks Tests (`hooks.test.ts`)

```typescript
describe('Lifecycle Hooks', () => {
  it('should call beforeModelSelection hook', async () => {
    const beforeModelSelection = jest.fn(async (ctx, metadata) => metadata);

    const ai = new AI({
      providers: { mock: createMockProvider() }
    }).withHooks({ beforeModelSelection });

    await ai.chat.get({ messages: [] });

    expect(beforeModelSelection).toHaveBeenCalled();
  });

  it('should call onModelSelected hook', async () => {
    const onModelSelected = jest.fn();

    const ai = new AI({
      providers: { mock: createMockProvider() }
    }).withHooks({ onModelSelected });

    await ai.chat.get({ messages: [] });

    expect(onModelSelected).toHaveBeenCalled();
  });

  it('should call beforeRequest hook', async () => {
    const beforeRequest = jest.fn();

    const ai = new AI({
      providers: { mock: createMockProvider() }
    }).withHooks({ beforeRequest });

    await ai.chat.get({ messages: [] });

    expect(beforeRequest).toHaveBeenCalled();
  });

  it('should call afterRequest hook', async () => {
    const afterRequest = jest.fn();

    const ai = new AI({
      providers: { mock: createMockProvider() }
    }).withHooks({ afterRequest });

    await ai.chat.get({ messages: [] });

    expect(afterRequest).toHaveBeenCalled();
  });

  it('should call onError hook on failure', async () => {
    const onError = jest.fn();
    const failingProvider = createMockProvider();
    failingProvider.createExecutor = () => createMockExecutor({
      error: new Error('Test error')
    });

    const ai = new AI({
      providers: { mock: failingProvider }
    }).withHooks({ onError });

    await expect(ai.chat.get({ messages: [] })).rejects.toThrow();

    expect(onError).toHaveBeenCalled();
  });
});
```

---

## 3. Provider Packages (Unit Tests with Mocks)

Each provider package should have unit tests that mock HTTP calls.

### OpenAI Provider Tests

**Location**: `packages/openai/src/__tests__/`

```typescript
// __tests__/openai.test.ts
import { OpenAIProvider } from '../openai';

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    provider = new OpenAIProvider({ apiKey: 'test-key' });
  });

  describe('Model Listing', () => {
    it('should list models', async () => {
      // Mock OpenAI client
      const models = await provider.listModels();
      expect(models).toBeDefined();
    });
  });

  describe('Chat Completion', () => {
    it('should create executor', () => {
      const executor = provider.createExecutor();
      expect(executor).toBeDefined();
    });

    it('should handle rate limits', async () => {
      // Mock rate limit error
      // Test error handling
    });
  });

  describe('Image Generation', () => {
    it('should generate image', async () => {
      const result = await provider.generateImage!(
        { prompt: 'Test' },
        {} as any,
        provider.config
      });

      expect(result.images).toBeDefined();
    });

    it('should use model from context metadata', async () => {
      const ctx = {
        metadata: { model: 'dall-e-2' }
      };

      // Spy on client.images.generate to verify model parameter
    });
  });
});
```

---

## 4. Integration Tests (Real API Calls)

**Location**: `packages/*/src/__integration__/`

### Setup

```typescript
// __integration__/setup.ts
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

export const getAPIKey = (provider: string): string => {
  const key = process.env[`${provider.toUpperCase()}_API_KEY`];
  if (!key) {
    throw new Error(`Missing ${provider.toUpperCase()}_API_KEY in environment`);
  }
  return key;
};

export const skipIfNoAPIKey = (provider: string) => {
  if (!process.env[`${provider.toUpperCase()}_API_KEY`]) {
    return describe.skip;
  }
  return describe;
};
```

### OpenAI Integration Tests

```typescript
// packages/openai/src/__integration__/openai.integration.test.ts
import { OpenAIProvider } from '../openai';
import { getAPIKey, skipIfNoAPIKey } from './setup';

const describeIntegration = skipIfNoAPIKey('openai');

describeIntegration('OpenAI Integration', () => {
  let provider: OpenAIProvider;

  beforeAll(() => {
    provider = new OpenAIProvider({
      apiKey: getAPIKey('openai')
    });
  });

  it('should list real models', async () => {
    const models = await provider.listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.some(m => m.id.includes('gpt'))).toBe(true);
  }, 30000); // 30s timeout

  it('should complete chat', async () => {
    const executor = provider.createExecutor();
    const response = await executor(
      {
        messages: [{ role: 'user', content: 'Say "test successful"' }],
        maxTokens: 10
      },
      {} as any,
      { model: 'gpt-4o-mini' }
    );

    expect(response.content).toContain('test successful');
  }, 30000);

  it('should generate image', async () => {
    const result = await provider.generateImage!(
      {
        prompt: 'A red circle',
        size: '256x256',
        model: 'dall-e-2'
      },
      {} as any
    );

    expect(result.images[0].url).toBeDefined();
  }, 60000);
});
```

---

## 5. Multi-Provider Integration Tests

**Location**: `packages/test-integration/`

### Package Setup

```json
// packages/test-integration/package.json
{
  "name": "@aits/test-integration",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "@aits/ai": "*",
    "@aits/core": "*",
    "@aits/openai": "*",
    "@aits/openrouter": "*",
    "@aits/replicate": "*",
    "@aits/xai": "*"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "jest": "^29.5.0",
    "dotenv": "^16.0.0",
    "typescript": "^5.0.0"
  }
}
```

### Test Structure

```
packages/test-integration/
├── src/
│   ├── __tests__/
│   │   ├── multi-provider.test.ts
│   │   ├── failover.test.ts
│   │   ├── cost-comparison.test.ts
│   │   └── compatibility.test.ts
│   └── setup.ts
├── jest.config.js
└── package.json
```

### Multi-Provider Tests

```typescript
// src/__tests__/multi-provider.test.ts
import { AI } from '@aits/ai';
import { OpenAIProvider } from '@aits/openai';
import { OpenRouterProvider } from '@aits/openrouter';
import { XAIProvider } from '@aits/xai';

describe('Multi-Provider Integration', () => {
  let ai: AI;

  beforeAll(async () => {
    ai = new AI({
      providers: {
        openai: new OpenAIProvider({
          apiKey: process.env.OPENAI_API_KEY!
        }),
        openrouter: new OpenRouterProvider({
          apiKey: process.env.OPENROUTER_API_KEY!
        }),
        xai: new XAIProvider({
          apiKey: process.env.XAI_API_KEY!
        })
      }
    });

    await ai.models.refresh();
  });

  it('should have models from all providers', () => {
    const models = ai.models.list();

    const hasOpenAI = models.some(m => m.provider === 'openai');
    const hasOpenRouter = models.some(m => m.provider === 'openrouter');
    const hasXAI = models.some(m => m.provider === 'xai');

    expect(hasOpenAI).toBe(true);
    expect(hasOpenRouter).toBe(true);
    expect(hasXAI).toBe(true);
  });

  it('should select cheapest model across providers', () => {
    const selected = ai.models.select({
      required: ['chat'],
      weights: { cost: 1.0 }
    });

    expect(selected).toBeDefined();
    console.log(`Cheapest model: ${selected!.model.id} from ${selected!.model.provider}`);
  });

  it('should execute chat on multiple providers', async () => {
    const providers = ['openai', 'openrouter', 'xai'];

    for (const provider of providers) {
      const result = await ai.chat.get(
        { messages: [{ role: 'user', content: 'Say "hello"' }] },
        {
          metadata: {
            providers: { allow: [provider] },
            required: ['chat']
          }
        }
      );

      expect(result.content).toBeTruthy();
      console.log(`${provider}: ${result.content}`);
    }
  }, 60000);
});
```

---

## Test Configuration

### Root Jest Config

```javascript
// jest.config.js (root)
module.exports = {
  projects: [
    '<rootDir>/packages/*/jest.config.js'
  ],
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.test.ts',
    '!packages/*/src/**/*.spec.ts',
    '!packages/*/src/__tests__/**',
    '!packages/*/src/__integration__/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

### Package Jest Config Template

```javascript
// packages/*/jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__integration__/**/*.test.ts'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/__tests__/**',
    '!src/**/__integration__/**'
  ],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  globals: {
    'ts-jest': {
      isolatedModules: true
    }
  }
};
```

### Environment Variables Template

```bash
# .env.test.example
# Copy to .env.test and fill in your API keys

# OpenAI
OPENAI_API_KEY=sk-...

# OpenRouter
OPENROUTER_API_KEY=sk-...

# Replicate
REPLICATE_API_KEY=r8_...

# xAI
XAI_API_KEY=xai-...

# Google
GOOGLE_API_KEY=...
```

---

## Running Tests

### Commands

```bash
# Run all unit tests (no API calls)
npm test

# Run specific package tests
npm test --workspace=@aits/core

# Run integration tests (requires API keys)
npm run test:integration

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch

# Run multi-provider tests
npm test --workspace=@aits/test-integration
```

### CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3

  integration-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:integration
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
```

---

## Coverage Goals

| Package | Target Coverage |
|---------|----------------|
| @aits/core | 90% |
| @aits/ai | 85% |
| @aits/openai | 80% |
| @aits/openrouter | 80% |
| @aits/replicate | 80% |
| @aits/xai | 80% |
| @aits/google | 80% |

---

## Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Set up Jest in all packages
- [ ] Create mock utilities for core package
- [ ] Create mock provider for ai package
- [ ] Set up test fixtures and helpers

### Phase 2: Core Package Tests
- [ ] Executor tests
- [ ] Streamer tests
- [ ] Prompt tests
- [ ] Tool tests
- [ ] Agent tests
- [ ] Combination tests
- [ ] Error handling tests

### Phase 3: AI Package Tests
- [ ] Registry tests
- [ ] Model selection tests
- [ ] Chat API tests
- [ ] Image API tests
- [ ] Audio API tests
- [ ] Embedding API tests
- [ ] Hooks tests
- [ ] Context tests

### Phase 4: Provider Unit Tests
- [ ] OpenAI provider tests
- [ ] OpenRouter provider tests
- [ ] Replicate provider tests
- [ ] xAI provider tests
- [ ] Google provider tests

### Phase 5: Integration Tests
- [ ] OpenAI integration tests
- [ ] OpenRouter integration tests
- [ ] Replicate integration tests
- [ ] xAI integration tests
- [ ] Google integration tests

### Phase 6: Multi-Provider Tests
- [ ] Create test-integration package
- [ ] Multi-provider compatibility tests
- [ ] Failover tests
- [ ] Cost comparison tests
- [ ] Performance tests

### Phase 7: Documentation & CI
- [ ] Document test setup
- [ ] Create .env.test.example
- [ ] Set up CI/CD pipeline
- [ ] Add coverage reporting
- [ ] Write testing guide

---

## Maintenance

### Adding New Tests

When adding new features:
1. Write unit tests first (TDD approach)
2. Add integration tests if API changes
3. Update mock providers if new capabilities added
4. Ensure coverage stays above threshold

### Updating Mocks

When provider APIs change:
1. Update mock implementations
2. Update test fixtures
3. Run all tests to ensure compatibility
4. Update integration tests if needed
