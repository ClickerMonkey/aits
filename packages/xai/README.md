# @aits/xai

xAI provider for the AITS (AI TypeScript) framework. This package provides integration with xAI's Grok models through their OpenAI-compatible API.

## Features

- **Grok Models**: Access to xAI's Grok family of models
- **OpenAI-Compatible**: Uses OpenAI's API format for easy integration
- **Chat Completions**: Full support for chat-based interactions
- **Streaming**: Real-time streaming responses
- **Extends OpenAI Provider**: Built on the battle-tested OpenAI provider

## Installation

```bash
npm install @aits/xai @aits/openai @aits/ai @aits/core openai zod
```

## Quick Start

```typescript
import { XAIProvider } from '@aits/xai';
import { AI } from '@aits/ai';

// Create provider instance
const xai = new XAIProvider({
  apiKey: process.env.XAI_API_KEY!,
});

// Use with AI instance
const ai = AI.with()
  .providers({ xai })
  .create();

// Make a request
const response = await ai.chat.get([
  { role: 'user', content: 'Explain quantum computing' }
], {
  metadata: { model: 'grok-beta' }
});

console.log(response.content);
```

## Configuration

### Basic Configuration

```typescript
import { XAIProvider, XAIConfig } from '@aits/xai';

const config: XAIConfig = {
  apiKey: process.env.XAI_API_KEY!,
};

const provider = new XAIProvider(config);
```

### Custom Base URL

```typescript
const provider = new XAIProvider({
  apiKey: process.env.XAI_API_KEY!,
  baseURL: 'https://custom.x.ai/v1', // Optional custom endpoint
});
```

## Usage Examples

### Basic Chat

```typescript
const executor = provider.createExecutor();

const response = await executor(
  {
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What are the key features of xAI?' }
    ],
    temperature: 0.7,
    maxTokens: 500,
  },
  {},
  { model: 'grok-beta' }
);

console.log(response.content);
console.log('Tokens used:', response.usage.totalTokens);
```

### Streaming Chat

```typescript
const streamer = provider.createStreamer();

for await (const chunk of streamer(
  {
    messages: [
      { role: 'user', content: 'Write a short story about a friendly AI' }
    ]
  },
  {},
  { model: 'grok-beta' }
)) {
  if (chunk.content) {
    process.stdout.write(chunk.content);
  }
}
```

### Multi-turn Conversation

```typescript
const conversation = [
  { role: 'system' as const, content: 'You are Grok, a witty AI assistant.' },
  { role: 'user' as const, content: 'Tell me a joke about AI' },
];

// First response
let response = await executor(
  { messages: conversation },
  {},
  { model: 'grok-beta' }
);

conversation.push({ role: 'assistant', content: response.content });
conversation.push({ role: 'user', content: 'Can you explain that joke?' });

// Second response
response = await executor(
  { messages: conversation },
  {},
  { model: 'grok-beta' }
);
```

### Using with AI Instance

```typescript
import { AI } from '@aits/ai';
import { XAIProvider } from '@aits/xai';

const xai = new XAIProvider({
  apiKey: process.env.XAI_API_KEY!,
});

const ai = AI.with()
  .providers({ xai })
  .create({
    defaultMetadata: {
      model: 'grok-beta',
    },
  });

// Simple chat
const response = await ai.chat.get([
  { role: 'user', content: 'What is the meaning of life?' }
]);

// Streaming chat
for await (const chunk of ai.chat.stream([
  { role: 'user', content: 'Write a poem about technology' }
])) {
  if (chunk.content) {
    process.stdout.write(chunk.content);
  }
}
```

### With Function Calling

```typescript
import { z } from 'zod';

const response = await ai.chat.get([
  { role: 'user', content: 'What is the weather in Tokyo?' }
], {
  metadata: { model: 'grok-beta' },
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
  console.log('Tool calls:', response.toolCalls);
}
```

### Request Cancellation

```typescript
const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  const response = await executor(
    { messages: [{ role: 'user', content: 'Tell me a long story' }] },
    {},
    { model: 'grok-beta' },
    controller.signal
  );
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request was cancelled');
  }
}
```

## Configuration Options

### XAIConfig

Extends `OpenAIConfig` from `@aits/openai`.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `apiKey` | `string` | Yes | xAI API key from https://console.x.ai |
| `baseURL` | `string` | No | Custom base URL (defaults to https://api.x.ai/v1) |
| `organization` | `string` | No | Organization ID (if applicable) |

### Request Parameters

All standard chat completion parameters are supported:

| Parameter | Type | Description |
|-----------|------|-------------|
| `messages` | `Message[]` | Array of conversation messages |
| `temperature` | `number` | Sampling temperature (0-2) |
| `topP` | `number` | Nucleus sampling parameter |
| `maxTokens` | `number` | Maximum tokens to generate |
| `stop` | `string \| string[]` | Stop sequences |
| `tools` | `Tool[]` | Function definitions for tool calling |
| `toolChoice` | `'auto' \| 'required' \| 'none' \| { tool: string }` | Tool selection mode |
| `responseFormat` | `'text' \| 'json'` | Response format |

## Available Models

Currently available Grok models:

- **grok-beta**: The latest Grok model with extended capabilities
- **grok-vision-beta**: Grok with vision capabilities (when available)

Note: Model availability and naming may change. Check [xAI's documentation](https://docs.x.ai) for the latest models.

## Error Handling

The provider uses the same error types as the OpenAI provider:

```typescript
import { ProviderError, RateLimitError } from '@aits/xai';

try {
  const response = await executor(
    { messages: [{ role: 'user', content: 'Hello' }] },
    {},
    { model: 'grok-beta' }
  );
} catch (error) {
  if (error instanceof RateLimitError) {
    console.error('Rate limit exceeded');
    console.log(`Retry after ${error.retryAfter} seconds`);
  } else if (error instanceof ProviderError) {
    console.error(`Provider error: ${error.message}`);
    console.error('Cause:', error.cause);
  }
}
```

### Error Types

- **`ProviderError`**: Base error for all provider-related errors
- **`ProviderAuthError`**: Authentication/authorization failures
- **`RateLimitError`**: Rate limit exceeded
- **`ProviderQuotaError`**: Quota/usage limit exceeded

## API Reference

### XAIProvider

Extends `OpenAIProvider` from `@aits/openai`.

**Constructor**: `new XAIProvider(config: XAIConfig)`

**Methods**:
- Inherits all methods from `OpenAIProvider`
- `createExecutor<TContext, TMetadata>(config?)` - Create chat executor
- `createStreamer<TContext, TMetadata>(config?)` - Create streaming executor
- `listModels(config?)` - List available Grok models
- `checkHealth(config?)` - Check API health

**Overridden Methods**:
- `createClient(config)` - Creates OpenAI client with xAI endpoint
- `convertModel(model)` - Converts model info for Grok models
- `modelFilter(model)` - Filters to only include Grok models

## Supported Features

- ✅ Chat completions
- ✅ Streaming
- ✅ Function calling
- ✅ System messages
- ✅ Multi-turn conversations
- ✅ Temperature control
- ✅ Token limits
- ✅ Stop sequences
- ⏳ Vision (coming soon)
- ❌ Image generation
- ❌ Speech synthesis
- ❌ Transcription
- ❌ Embeddings

## Best Practices

1. **API Key Security**: Never hardcode API keys
   ```typescript
   apiKey: process.env.XAI_API_KEY!
   ```

2. **Error Handling**: Always wrap API calls in try-catch blocks
   ```typescript
   try {
     const response = await executor(...);
   } catch (error) {
     // Handle error
   }
   ```

3. **Streaming for Long Responses**: Use streaming for better UX
   ```typescript
   for await (const chunk of streamer(...)) {
     // Process chunks as they arrive
   }
   ```

4. **Token Management**: Monitor token usage to control costs
   ```typescript
   console.log('Tokens used:', response.usage.totalTokens);
   ```

5. **Request Cancellation**: Use AbortController for long requests
   ```typescript
   const controller = new AbortController();
   setTimeout(() => controller.abort(), timeout);
   ```

## Getting an API Key

1. Visit https://console.x.ai
2. Create an account or sign in
3. Navigate to API Keys section
4. Generate a new API key
5. Store it securely in your environment variables

## Related Packages

- **[@aits/core](../core)**: Core AITS framework types and interfaces
- **[@aits/ai](../ai)**: AI abstractions and utilities
- **[@aits/openai](../openai)**: OpenAI provider (base class)
- **[@aits/anthropic](../anthropic)**: Anthropic Claude provider
- **[@aits/openrouter](../openrouter)**: Multi-provider gateway

## Links

- [xAI Website](https://x.ai)
- [xAI Console](https://console.x.ai)
- [xAI Documentation](https://docs.x.ai)
- [xAI API Reference](https://docs.x.ai/api)

## License

MIT

## Contributing

Contributions are welcome! Please see the main [AITS repository](https://github.com/ClickerMonkey/aits) for contribution guidelines.

## Support

For issues and questions:
- GitHub Issues: https://github.com/ClickerMonkey/aits/issues
- Documentation: https://github.com/ClickerMonkey/aits
- xAI Support: https://x.ai/support
