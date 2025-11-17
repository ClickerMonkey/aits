# @aeye - AI TypeScript Library

> **Multi-provider AI library with intelligent model selection, type-safe context management, and comprehensive provider support.**

@aeye (AI TypeScript) is a modern, type-safe AI library for Node.js and TypeScript applications. It provides a unified interface for working with multiple AI providers (OpenAI, OpenRouter, Replicate, etc.) with automatic model selection, cost tracking, streaming support, and extensible architecture.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org/)

## Features

### Core Features

- 🎯 **Multi-Provider Support** - Single interface for OpenAI, OpenRouter, Replicate, and custom providers
- 🤖 **Intelligent Model Selection** - Automatic model selection based on capabilities, cost, speed, and quality
- 💰 **Cost Tracking** - Built-in token usage and cost calculation with provider-reported costs
- 🔄 **Streaming Support** - Full streaming support across all compatible capabilities
- 🛡️ **Type-Safe** - Strongly-typed context and metadata with compiler validation
- 🎨 **Comprehensive APIs** - Chat, Image Generation, Speech Synthesis, Transcription, Embeddings
- 🔌 **Extensible** - Custom providers, model handlers, and transformers
- 📊 **Model Registry** - Centralized model management with external sources

### Advanced Features

- ⚡ **Provider Capability Detection** - Automatic detection and validation of provider capabilities
- 🎣 **Lifecycle Hooks** - Intercept and modify operations at every stage
- 🔧 **Model Overrides** - Customize model properties without modifying providers
- 📦 **Model Sources** - External model sources (OpenRouter, custom APIs)
- 🌊 **Context Management** - Thread context through your entire AI operation
- 🎛️ **Fine-Grained Control** - Temperature, tokens, stop sequences, tool calling, and more

## Quick Start

### Installation

```bash
# Install core packages
npm install @aeye/ai @aeye/core zod

# Install provider packages as needed
npm install @aeye/openai openai       # OpenAI
npm install @aeye/openrouter          # OpenRouter (multi-provider)
npm install @aeye/replicate replicate # Replicate
```

### Basic Usage

```typescript
import { AI } from '@aeye/ai';
import { OpenAIProvider } from '@aeye/openai';

// Create providers
const openai = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!
});

// Create AI instance
const ai = AI.with()
  .providers({ openai })
  .create();

// Chat completion
const response = await ai.chat.get([
  { role: 'user', content: 'What is TypeScript?' }
]);
console.log(response.content);

// Streaming
for await (const chunk of ai.chat.stream([
  { role: 'user', content: 'Write a poem about AI' }
])) {
  if (chunk.content) {
    process.stdout.write(chunk.content);
  }
}
```

### Multi-Provider Setup

```typescript
import { AI } from '@aeye/ai';
import { OpenAIProvider } from '@aeye/openai';
import { OpenRouterProvider } from '@aeye/openrouter';

const openai = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! });
const openrouter = new OpenRouterProvider({ apiKey: process.env.OPENROUTER_API_KEY! });

const ai = AI.with()
  .providers({ openai, openrouter })
  .create({
    // Automatic model selection criteria
    defaultMetadata: {
      required: ['chat', 'streaming'],
      weights: {
        cost: 0.4,
        speed: 0.3,
        quality: 0.3,
      }
    }
  });

// AI automatically selects the best provider/model
const response = await ai.chat.get([
  { role: 'user', content: 'Explain quantum computing' }
]);
```

## Architecture

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
         │         │ • OpenRouter│
         │         │ • Replicate │
         └─────────┴─────────────┘
```

## Packages

### Core Packages

#### [@aeye/core](./packages/core)
Core types and interfaces for the @aeye framework. Defines the foundational types for requests, responses, providers, and streaming.

```bash
npm install @aeye/core
```

#### [@aeye/ai](./packages/ai)
Main AI library with intelligent model selection, context management, and comprehensive APIs. Built on top of @aeye/core.

```bash
npm install @aeye/ai @aeye/core
```

### Provider Packages

#### [@aeye/openai](./packages/openai)
OpenAI provider supporting GPT-4, GPT-3.5, DALL-E, Whisper, TTS, and embeddings. Serves as base class for OpenAI-compatible providers.

```bash
npm install @aeye/openai openai
```

**Features:**
- Chat completions (GPT-4, GPT-3.5 Turbo)
- Vision (GPT-4V)
- Reasoning models (o1, o3-mini)
- Image generation (DALL-E 2, DALL-E 3)
- Speech-to-text (Whisper)
- Text-to-speech (TTS)
- Embeddings
- Function calling
- Structured outputs

#### [@aeye/openrouter](./packages/openrouter)
OpenRouter provider for unified access to multiple AI providers with automatic fallbacks and competitive pricing.

```bash
npm install @aeye/openrouter
```

**Features:**
- Multi-provider access (OpenAI, Anthropic, Google, Meta, etc.)
- Automatic fallbacks
- Built-in cost tracking
- Zero Data Retention (ZDR) support
- Provider routing preferences

#### [@aeye/replicate](./packages/replicate)
Replicate provider with flexible adapter system for running open-source AI models.

```bash
npm install @aeye/replicate replicate
```

**Features:**
- Thousands of open-source models
- Model adapters for handling diverse schemas
- Image generation, transcription, embeddings
- Custom model support

## Usage Examples

### Image Generation

```typescript
import { AI } from '@aeye/ai';
import { OpenAIProvider } from '@aeye/openai';

const openai = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! });

const ai = AI.with()
  .providers({ openai })
  .create();

const imageResponse = await ai.image.generate.get({
  prompt: 'A serene mountain landscape at sunset',
  model: 'dall-e-3',
  size: '1024x1024',
  quality: 'hd'
});

console.log('Image URL:', imageResponse.images[0].url);
```

### Function Calling

```typescript
import z from 'zod';

const response = await ai.chat.get([
  { role: 'user', content: 'What is the weather in San Francisco?' }
], {
  tools: [
    {
      name: 'get_weather',
      description: 'Get current weather for a location',
      parameters: z.object({
        location: z.string(),
        unit: z.enum(['celsius', 'fahrenheit']).optional(),
      }),
    }
  ],
  toolChoice: 'auto',
});

if (response.toolCalls) {
  for (const toolCall of response.toolCalls) {
    console.log('Tool:', toolCall.name);
    console.log('Arguments:', JSON.parse(toolCall.arguments));
  }
}
```

### Speech Synthesis

```typescript
import fs from 'fs';

const speechResponse = await ai.speech.get({
  text: 'Hello! This is a text-to-speech example.',
  model: 'tts-1',
  voice: 'alloy',
});

fs.writeFileSync('output.mp3', speechResponse.audioBuffer);
```

### Audio Transcription

```typescript
import fs from 'fs';

const audioBuffer = fs.readFileSync('audio.mp3');

const transcription = await ai.transcribe.get({
  audio: audioBuffer,
  model: 'whisper-1',
  language: 'en',
});

console.log('Transcription:', transcription.text);
```

### Embeddings

```typescript
const embeddingResponse = await ai.embed.get({
  texts: [
    'The quick brown fox jumps over the lazy dog',
    'Machine learning is a subset of artificial intelligence',
  ],
  model: 'text-embedding-3-small',
});

embeddingResponse.embeddings.forEach((item, i) => {
  console.log(`Embedding ${i}:`, item.embedding.length, 'dimensions');
});
```

### Context Management

```typescript
interface AppContext {
  userId: string;
  sessionId: string;
  timestamp: Date;
}

const ai = AI.with<AppContext>()
  .providers({ openai })
  .create({
    defaultContext: {
      timestamp: new Date(),
    }
  });

const response = await ai.chat.get([
  { role: 'user', content: 'Hello!' }
], {
  userId: 'user123',
  sessionId: 'session456',
});
```

### Lifecycle Hooks

```typescript
const ai = AI.with()
  .providers({ openai })
  .create({
    hooks: {
      beforeRequest: async (ctx, request, selected, estimatedTokens, estimatedCost) => {
        console.log(`Using model: ${selected.model.id}`);
        console.log(`Estimated tokens: ${estimatedTokens}`);
      },
      afterRequest: async (ctx, request, response, responseComplete, selected, usage, cost) => {
        console.log(`Tokens used: ${usage.totalTokens}`);
        console.log(`Cost: $${cost}`);
      },
    }
  });
```

### Model Selection

```typescript
// Explicit model selection
const response = await ai.chat.get(messages, {
  metadata: { model: 'gpt-4-turbo' }
});

// Automatic selection with criteria
const response = await ai.chat.get(messages, {
  metadata: {
    required: ['chat', 'streaming', 'vision'],
    optional: ['tools'],
    weights: {
      cost: 0.3,
      speed: 0.4,
      quality: 0.3,
    },
    minContextWindow: 32000,
  }
});

// Provider filtering
const response = await ai.chat.get(messages, {
  metadata: {
    providers: {
      allow: ['openai', 'anthropic'],
      deny: ['low-quality-provider'],
    }
  }
});
```

## Advanced Features

### Custom Providers

Create custom providers by implementing the `Provider` interface or extending existing providers:

```typescript
import { OpenAIProvider, OpenAIConfig } from '@aeye/openai';
import OpenAI from 'openai';

class CustomProvider extends OpenAIProvider {
  readonly name = 'custom';

  protected createClient(config: OpenAIConfig) {
    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: 'https://custom-api.example.com/v1',
    });
  }
}
```

### Model Sources

Fetch models from external sources:

```typescript
import { OpenRouterModelSource } from '@aeye/openrouter';

const ai = AI.with()
  .providers({ openai })
  .create({
    fetchOpenRouterModels: true, // Auto-fetch all OpenRouter models
  });

// Or manually
const source = new OpenRouterModelSource({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const models = await source.fetchModels();
```

### Model Overrides

Customize model properties:

```typescript
const ai = AI.with()
  .providers({ openai })
  .create({
    modelOverrides: [
      {
        modelId: 'gpt-4',
        overrides: {
          pricing: {
            inputTokensPer1M: 30,
            outputTokensPer1M: 60,
          },
        },
      },
    ],
  });
```

### Provider Capability Detection

```typescript
import { getProviderCapabilities } from '@aeye/ai';

const openai = new OpenAIProvider({ apiKey: '...' });
const caps = getProviderCapabilities(openai);
console.log(caps);
// Set(['chat', 'streaming', 'image', 'audio', 'hearing', 'embedding'])

const openrouter = new OpenRouterProvider({ apiKey: '...' });
const caps = getProviderCapabilities(openrouter);
console.log(caps.has('image')); // false - OpenRouter doesn't support image generation
```

## Configuration

### AI Instance Configuration

```typescript
interface AIConfig<T> {
  // Default context values
  defaultContext?: Partial<T>;

  // Provider to context loader
  provideContext?: (required: T) => Promise<Partial<T>>;

  // Default metadata for all requests
  defaultMetadata?: Partial<AIBaseMetadata>;

  // Model overrides
  modelOverrides?: ModelOverride[];

  // Default cost per million tokens
  defaultCostPerMillionTokens?: number;

  // External model sources
  modelSources?: ModelSource[];

  // Lifecycle hooks
  hooks?: AIHooks<T>;
}
```

### Provider Configurations

Each provider has its own configuration:

```typescript
// OpenAI
interface OpenAIConfig {
  apiKey: string;
  baseURL?: string;
  organization?: string;
}

// OpenRouter
interface OpenRouterConfig extends OpenAIConfig {
  defaultParams?: {
    siteUrl?: string;
    appName?: string;
    allowFallbacks?: boolean;
    providers?: {
      prefer?: string[];
      allow?: string[];
      deny?: string[];
    };
  };
}

// Replicate
interface ReplicateConfig {
  apiKey: string;
  baseUrl?: string;
  transformers?: Record<string, ModelTransformer>;
}
```

## Cost Tracking

@aeye provides comprehensive cost tracking:

```typescript
const response = await ai.chat.get(messages);

// Token usage
console.log('Input tokens:', response.usage.inputTokens);
console.log('Output tokens:', response.usage.outputTokens);
console.log('Total tokens:', response.usage.totalTokens);

// Cost (calculated or provider-reported)
console.log('Cost: $', response.usage.cost);

// For providers like OpenRouter, cost is provided by the API
// For others, it's calculated based on model pricing
```

## Error Handling

```typescript
import { ProviderError, RateLimitError } from '@aeye/openai';

try {
  const response = await ai.chat.get(messages);
} catch (error) {
  if (error instanceof RateLimitError) {
    console.error('Rate limit exceeded');
    console.log(`Retry after ${error.retryAfter} seconds`);
  } else if (error instanceof ProviderError) {
    console.error(`Provider error: ${error.message}`);
    console.error('Cause:', error.cause);
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Model Capabilities

@aeye uses a capability system for model selection:

| Capability | Description | Example Providers |
|------------|-------------|-------------------|
| `chat` | Basic text completion | OpenAI, OpenRouter |
| `streaming` | Real-time response streaming | OpenAI, OpenRouter |
| `image` | Image generation | OpenAI (DALL-E), Replicate |
| `vision` | Image understanding | OpenAI (GPT-4V) |
| `audio` | Text-to-speech | OpenAI (TTS) |
| `hearing` | Speech-to-text | OpenAI (Whisper), Replicate |
| `embedding` | Text embeddings | OpenAI, Replicate |
| `tools` | Function/tool calling | OpenAI, OpenRouter |
| `json` | JSON output mode | OpenAI, OpenRouter |
| `structured` | Structured outputs | OpenAI |
| `reasoning` | Extended reasoning | OpenAI (o1 models) |
| `zdr` | Zero data retention | OpenRouter |

## Development

### Building

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm run test

# Clean build artifacts
npm run clean
```

### Project Structure

```
aeye/
├── packages/
│   ├── core/          # Core types and interfaces
│   ├── ai/            # Main AI library
│   ├── openai/        # OpenAI provider
│   ├── openrouter/    # OpenRouter provider
│   ├── replicate/     # Replicate provider
├── package.json       # Root package configuration
└── tsconfig.json      # TypeScript configuration
```

## Best Practices

1. **API Key Security** - Never hardcode API keys, use environment variables

2. **Error Handling** - Always wrap AI calls in try-catch blocks

3. **Streaming** - Use streaming for better UX with lengthy responses

4. **Cost Monitoring** - Monitor `response.usage.cost` to track expenses

5. **Model Selection** - Use appropriate models for your use case
   - GPT-4 for complex tasks
   - GPT-3.5 for simple/fast tasks
   - Specialized models (DALL-E, Whisper) for specific tasks

6. **Context Management** - Use context to thread data through operations

7. **Provider Selection** - Choose providers based on:
   - Cost efficiency
   - Feature availability
   - Reliability/uptime
   - Privacy requirements (ZDR)

## Roadmap

- [ ] Anthropic Claude provider
- [ ] Built-in retry logic with exponential backoff
- [ ] Rate limiting utilities
- [ ] Caching layer

## Contributing

Contributions are welcome! Areas where we'd especially appreciate help:

- **New Providers** - Anthropic, Google, Cohere, etc.
- **Model Adapters** - For Replicate and other platforms
- **Documentation** - Examples, tutorials, guides
- **Testing** - Unit tests, integration tests
- **Bug Fixes** - Issue reports and fixes

Please see the main [@aeye repository](https://github.com/ClickerMonkey/aeye) for contribution guidelines.

## Related Projects

- [OpenAI Node SDK](https://github.com/openai/openai-node)
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [Replicate SDK](https://github.com/replicate/replicate-javascript)
- [LangChain](https://github.com/langchain-ai/langchainjs)
- [Vercel AI SDK](https://github.com/vercel/ai)

## License

MIT © [ClickerMonkey](https://github.com/ClickerMonkey)

See [LICENSE](./LICENSE) for details.

## Support

- **GitHub Issues**: https://github.com/ClickerMonkey/aeye/issues
- **Documentation**: https://github.com/ClickerMonkey/aeye
- **Examples**: See `/examples` directory (coming soon)

## Acknowledgments

Built with ❤️ by [ClickerMonkey](https://github.com/ClickerMonkey) and contributors.

Special thanks to:
- OpenAI for the OpenAI API
- OpenRouter for multi-provider access
- All the open-source AI model creators
- The TypeScript community

---

**Made with TypeScript** | **MIT Licensed** | **Production Ready**
