# @aeye/openrouter

OpenRouter provider for the @aeye (AI TypeScript) framework. OpenRouter provides unified access to multiple AI providers through a single API, with automatic fallbacks, routing optimization, and competitive pricing.

## Features

- **Multi-Provider Access**: Access models from OpenAI, Anthropic, Google, Meta, and more through one API
- **Automatic Fallbacks**: Seamless failover to alternative providers if primary fails
- **Intelligent Routing**: Automatic selection of best provider for each request
- **Cost Tracking**: Built-in cost information in responses
- **ZDR Support**: Zero Data Retention mode for privacy-sensitive applications
- **Provider Preferences**: Control which providers to use, prefer, or avoid
- **Reasoning Models**: Support for advanced reasoning with o1, Claude, and others
- **Streaming**: Full streaming support across compatible models
- **Extends OpenAI**: Built on the OpenAI provider for compatibility

## Installation

```bash
npm install @aeye/openrouter @aeye/openai @aeye/ai @aeye/core openai zod
```

## Quick Start

```typescript
import { OpenRouterProvider } from '@aeye/openrouter';
import { AI } from '@aeye/ai';

// Create provider instance
const openrouter = new OpenRouterProvider({
  apiKey: process.env.OPENROUTER_API_KEY!,
  defaultParams: {
    siteUrl: 'https://yourapp.com',
    appName: 'Your App Name',
  },
});

// Use with AI instance
const ai = AI.with()
  .providers({ openrouter })
  .create();

// Make a request (OpenRouter picks the best provider)
const response = await ai.chat.get([
  { role: 'user', content: 'Explain TypeScript generics' }
], {
  metadata: { model: 'openai/gpt-4-turbo' }
});

console.log(response.content);
console.log('Cost:', response.usage.cost); // Actual cost from OpenRouter
```

## Configuration

### Basic Configuration

```typescript
import { OpenRouterProvider, OpenRouterConfig } from '@aeye/openrouter';

const config: OpenRouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY!,
  defaultParams: {
    siteUrl: 'https://yourapp.com', // Your app URL (helps with rankings)
    appName: 'My AI App', // Your app name (shown in OpenRouter dashboard)
  },
};

const provider = new OpenRouterProvider(config);
```

### Advanced Configuration

```typescript
const provider = new OpenRouterProvider({
  apiKey: process.env.OPENROUTER_API_KEY!,
  defaultParams: {
    siteUrl: 'https://yourapp.com',
    appName: 'My AI App',

    // Automatic fallbacks
    allowFallbacks: true, // Enable fallback to alternative providers

    // Provider preferences
    providers: {
      prefer: ['openai', 'anthropic'], // Prefer these providers
      allow: ['openai', 'anthropic', 'google'], // Only use these providers
      deny: ['provider-x'], // Never use these providers
      ignore: ['low-quality-provider'], // Exclude from consideration
      order: ['openai', 'anthropic'], // Preferred order
      quantizations: ['int8', 'fp16'], // Preferred quantization levels
      dataCollection: 'deny', // or 'allow' - control data collection
    },

    // Privacy & security
    requireParameters: true, // Require all providers to support parameters
    dataCollection: 'deny', // Global data collection setting

    // Model transformations
    transforms: ['middle-out'], // Apply transformations to requests
  },
});
```

## Usage Examples

### Basic Chat with Cost Tracking

```typescript
const response = await ai.chat.get([
  { role: 'user', content: 'What is the capital of France?' }
], {
  metadata: { model: 'openai/gpt-3.5-turbo' }
});

console.log(response.content);
console.log('Tokens:', response.usage.totalTokens);
console.log('Cost: $', response.usage.cost); // Actual cost from OpenRouter
```

### Using Multiple Models

OpenRouter allows you to access models from different providers using the format `provider/model`:

```typescript
// OpenAI GPT-4
const gpt4 = await ai.chat.get(messages, {
  metadata: { model: 'openai/gpt-4-turbo' }
});

// Anthropic Claude
const claude = await ai.chat.get(messages, {
  metadata: { model: 'anthropic/claude-3-opus' }
});

// Google Gemini
const gemini = await ai.chat.get(messages, {
  metadata: { model: 'google/gemini-pro' }
});

// Meta Llama
const llama = await ai.chat.get(messages, {
  metadata: { model: 'meta-llama/llama-3-70b' }
});
```

### Automatic Model Selection

Let OpenRouter choose the best model based on your criteria:

```typescript
const ai = AI.with()
  .providers({ openrouter })
  .create({
    defaultMetadata: {
      required: ['chat', 'streaming'],
      weights: {
        speed: 0.3,
        cost: 0.4,
        quality: 0.3,
      },
    },
  });

// OpenRouter will select the best model matching criteria
const response = await ai.chat.get([
  { role: 'user', content: 'Explain quantum computing' }
]);
```

### Provider Fallbacks

```typescript
// Primary provider fails? OpenRouter automatically falls back
const provider = new OpenRouterProvider({
  apiKey: process.env.OPENROUTER_API_KEY!,
  defaultParams: {
    allowFallbacks: true,
    providers: {
      order: ['openai', 'anthropic', 'google'], // Try in this order
    },
  },
});

// If OpenAI is down, automatically tries Anthropic, then Google
const response = await ai.chat.get(messages, {
  metadata: { model: 'openai/gpt-4-turbo' }
});
```

### Zero Data Retention (ZDR)

```typescript
// Only use ZDR-compliant models
const ai = AI.with()
  .providers({ openrouter })
  .create({
    defaultMetadata: {
      required: ['chat', 'zdr'], // Require ZDR support
    },
  });

// Also configure at provider level
const provider = new OpenRouterProvider({
  apiKey: process.env.OPENROUTER_API_KEY!,
  defaultParams: {
    dataCollection: 'deny', // Ensure no data collection
  },
});
```

### Streaming with Cost Tracking

```typescript
let totalCost = 0;

for await (const chunk of ai.chat.stream([
  { role: 'user', content: 'Write a story about a robot' }
], {
  metadata: { model: 'anthropic/claude-3-sonnet' }
})) {
  if (chunk.content) {
    process.stdout.write(chunk.content);
  }

  // Cost is sent in final chunk
  if (chunk.usage?.cost) {
    totalCost = chunk.usage.cost;
  }
}

console.log(`\n\nTotal cost: $${totalCost}`);
```

### Reasoning Models

```typescript
// Use OpenAI o1 through OpenRouter
const response = await ai.chat.get([
  {
    role: 'user',
    content: 'Solve: If a train leaves NYC at 3pm going 60mph, and another leaves Boston at 4pm going 80mph, when do they meet?'
  }
], {
  metadata: { model: 'openai/o1-preview' }
});

console.log('Reasoning:', response.reasoning);
console.log('Answer:', response.content);
console.log('Cost:', response.usage.cost);
```

### Function Calling

```typescript
import z from 'zod';

const response = await ai.chat.get([
  { role: 'user', content: 'What is the weather in Paris?' }
], {
  metadata: { model: 'openai/gpt-4-turbo' },
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
```

### Fetching Available Models

OpenRouter provides a model source that can fetch all available models:

```typescript
import { OpenRouterModelSource } from '@aeye/openrouter';

const source = new OpenRouterModelSource({
  apiKey: process.env.OPENROUTER_API_KEY,
  includeZDR: true, // Include ZDR information
});

const models = await source.fetchModels();

models.forEach(model => {
  console.log(`${model.id}`);
  console.log(`  Pricing: $${model.pricing.inputTokensPer1M}/1M input tokens`);
  console.log(`  Context: ${model.contextWindow} tokens`);
  console.log(`  ZDR: ${model.capabilities.has('zdr')}`);
});
```

### Automatic Model Registration

```typescript
// Automatically fetch and register OpenRouter models
const ai = AI.with()
  .providers({ openrouter })
  .create({
    fetchOpenRouterModels: true, // Auto-fetch all available models
  });

// Now all OpenRouter models are available for automatic selection
const response = await ai.chat.get(messages);
```

## Configuration Options

### OpenRouterConfig

Extends `OpenAIConfig` from `@aeye/openai`.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `apiKey` | `string` | Yes | OpenRouter API key |
| `baseURL` | `string` | No | Custom base URL (defaults to https://openrouter.ai/api/v1) |
| `defaultParams` | `object` | No | Default parameters for all requests |

### defaultParams

| Property | Type | Description |
|----------|------|-------------|
| `siteUrl` | `string` | Your app URL (helps with rankings on OpenRouter) |
| `appName` | `string` | Your app name (shown in OpenRouter dashboard) |
| `allowFallbacks` | `boolean` | Enable automatic provider fallbacks |
| `requireParameters` | `boolean` | Require all providers support parameters |
| `dataCollection` | `'deny' \| 'allow'` | Control data collection |
| `order` | `string[]` | Preferred provider order |
| `providers` | `object` | Provider preferences (see below) |
| `transforms` | `string[]` | Request transformations to apply |

### providers Options

| Property | Type | Description |
|----------|------|-------------|
| `allow` | `string[]` | Whitelist of allowed providers |
| `deny` | `string[]` | Blacklist of denied providers |
| `prefer` | `string[]` | Preferred providers (given priority) |
| `ignore` | `string[]` | Providers to ignore |
| `order` | `string[]` | Explicit provider order |
| `quantizations` | `string[]` | Preferred quantization levels |
| `dataCollection` | `'deny' \| 'allow'` | Provider-level data collection |

## Cost Information

OpenRouter includes actual cost information in every response:

```typescript
const response = await ai.chat.get(messages, {
  metadata: { model: 'openai/gpt-4-turbo' }
});

// Cost is automatically included
console.log('Input tokens:', response.usage.inputTokens);
console.log('Output tokens:', response.usage.outputTokens);
console.log('Cost: $', response.usage.cost); // Actual USD cost

// Cost calculation is skipped when provider returns cost
// No need to manually calculate costs!
```

The cost is provided by OpenRouter's API in the `total_cost` field and automatically extracted into the `usage.cost` field.

## Model Format

OpenRouter uses the format `provider/model-name`:

- `openai/gpt-4-turbo`
- `anthropic/claude-3-opus`
- `google/gemini-pro`
- `meta-llama/llama-3-70b-instruct`
- `mistralai/mistral-large`
- `cohere/command-r-plus`

See the [OpenRouter Models](https://openrouter.ai/models) page for the full list.

## Privacy & Data Retention

### Zero Data Retention (ZDR)

OpenRouter supports ZDR mode where your data is not stored:

```typescript
// Require ZDR-compliant models
const ai = AI.with()
  .providers({ openrouter })
  .create({
    defaultMetadata: {
      required: ['chat', 'zdr'],
    },
  });

// Or configure at provider level
const provider = new OpenRouterProvider({
  apiKey: process.env.OPENROUTER_API_KEY!,
  defaultParams: {
    dataCollection: 'deny',
    providers: {
      dataCollection: 'deny',
    },
  },
});
```

Models with ZDR support have the `zdr` capability tag.

## Error Handling

OpenRouter uses the same error types as the OpenAI provider:

```typescript
import { ProviderError, RateLimitError } from '@aeye/openrouter';

try {
  const response = await ai.chat.get(messages, {
    metadata: { model: 'openai/gpt-4-turbo' }
  });
} catch (error) {
  if (error instanceof RateLimitError) {
    console.error('Rate limit exceeded');
    console.log(`Retry after ${error.retryAfter} seconds`);
  } else if (error instanceof ProviderError) {
    console.error(`Provider error: ${error.message}`);
  }
}
```

## Best Practices

1. **Set Site URL and App Name**: This helps with OpenRouter rankings and analytics
   ```typescript
   defaultParams: {
     siteUrl: 'https://yourapp.com',
     appName: 'Your App',
   }
   ```

2. **Use Cost Tracking**: Monitor costs with the built-in `usage.cost` field
   ```typescript
   console.log('Cost: $', response.usage.cost);
   ```

3. **Enable Fallbacks**: Use automatic fallbacks for reliability
   ```typescript
   defaultParams: {
     allowFallbacks: true,
     providers: {
       order: ['openai', 'anthropic', 'google'],
     },
   }
   ```

4. **Specify Provider Preferences**: Control which providers are used
   ```typescript
   providers: {
     prefer: ['openai', 'anthropic'],
     deny: ['low-quality-provider'],
   }
   ```

5. **Use ZDR for Sensitive Data**: Enable Zero Data Retention for privacy
   ```typescript
   defaultParams: {
     dataCollection: 'deny',
   }
   ```

6. **Monitor Model Availability**: OpenRouter's model list changes frequently
   ```typescript
   fetchOpenRouterModels: true // Auto-fetch latest models
   ```

## API Reference

### OpenRouterProvider

Extends `OpenAIProvider` from `@aeye/openai`.

**Constructor**: `new OpenRouterProvider(config: OpenRouterConfig)`

**Methods**:
- Inherits all methods from `OpenAIProvider`
- `createExecutor<TContext, TMetadata>(config?)` - Returns executor with cost tracking
- `createStreamer<TContext, TMetadata>(config?)` - Returns streamer with cost tracking
- `listModels(config?)` - Fetches models from OpenRouter API with ZDR info

**Overridden Methods**:
- `createClient(config)` - Creates OpenAI client with OpenRouter endpoint
- `customizeChatParams(params, config, request)` - Adds OpenRouter-specific params

### OpenRouterModelSource

Model source for fetching OpenRouter models.

**Constructor**: `new OpenRouterModelSource(config?: OpenRouterSourceConfig)`

**Methods**:
- `fetchModels(config?): Promise<ModelInfo[]>` - Fetch all available models

**Config Options**:
- `apiKey?: string` - OpenRouter API key (optional for public models)
- `includeZDR?: boolean` - Include ZDR information (default: true)

## Supported Features

- ✅ Chat completions
- ✅ Streaming
- ✅ Function calling
- ✅ Vision (for supported models)
- ✅ Reasoning models
- ✅ Cost tracking
- ✅ Automatic fallbacks
- ✅ Provider routing
- ✅ ZDR mode
- ✅ Multi-modal (for supported models)
- ❌ Image generation (not supported by OpenRouter)
- ❌ Speech synthesis (not supported by OpenRouter)
- ❌ Transcription (not supported by OpenRouter)
- ❌ Embeddings (not supported by OpenRouter)

For image generation, speech, transcription, and embeddings, use provider-specific packages like `@aeye/openai`, `@aeye/anthropic`, etc.

## Related Packages

- **[@aeye/core](../core)**: Core @aeye framework types and interfaces
- **[@aeye/ai](../ai)**: AI abstractions and utilities
- **[@aeye/openai](../openai)**: OpenAI provider (base class)
- **[@aeye/anthropic](../anthropic)**: Anthropic Claude provider
- **[@aeye/google](../google)**: Google AI provider

## Links

- [OpenRouter Website](https://openrouter.ai)
- [OpenRouter Models](https://openrouter.ai/models)
- [OpenRouter Documentation](https://openrouter.ai/docs)
- [OpenRouter API Keys](https://openrouter.ai/keys)

## License

MIT

## Contributing

Contributions are welcome! Please see the main [@aeye repository](https://github.com/ClickerMonkey/aeye) for contribution guidelines.

## Support

For issues and questions:
- GitHub Issues: https://github.com/ClickerMonkey/aeye/issues
- Documentation: https://github.com/ClickerMonkey/aeye
- OpenRouter Discord: https://discord.gg/openrouter
