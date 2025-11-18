# Provider Hooks

Provider hooks allow you to intercept and log requests and responses for debugging or monitoring purposes. Each provider supports pre-request and post-request hooks that are called before and after API calls.

## Overview

Hooks are configured on the provider's config object and receive all arguments from the outer function call, including:
- The request object (the high-level @aeye request)
- The params object (the provider-specific parameters sent to the API)
- The response object (post-request hook only)
- The context object
- The metadata object (when applicable)

## Example: Logging OpenAI Requests

```typescript
import { AI } from '@aeye/ai';
import { OpenAIProvider } from '@aeye/openai';

// Create provider with hooks
const openai = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  hooks: {
    chat: {
      preRequest: async (request, params, ctx, metadata) => {
        console.log('[OpenAI] Chat request:', {
          model: params.model,
          messageCount: request.messages.length,
          temperature: params.temperature,
          maxTokens: params.max_completion_tokens,
          timestamp: new Date().toISOString()
        });
      },
      postRequest: async (request, params, response, ctx, metadata) => {
        console.log('[OpenAI] Chat response:', {
          model: response.model?.id,
          tokens: response.usage?.text,
          finishReason: response.finishReason,
          paramsUsed: params.model,
          timestamp: new Date().toISOString()
        });
      }
    },
    imageGenerate: {
      preRequest: async (request, params, ctx) => {
        console.log('[OpenAI] Image generation request:', {
          prompt: params.prompt,
          model: params.model,
          size: params.size,
          timestamp: new Date().toISOString()
        });
      },
      postRequest: async (request, params, response, ctx) => {
        console.log('[OpenAI] Image generation response:', {
          imageCount: response.images.length,
          hasUrls: response.images.some(img => img.url),
          paramsUsed: params.model,
          timestamp: new Date().toISOString()
        });
      }
    }
  }
});

const ai = AI.with()
  .providers({ openai })
  .create();

// Make a chat request - hooks will be called automatically
const response = await ai.chat.get([
  { role: 'user', content: 'What is TypeScript?' }
]);
```

## Example: Request Tracking and Metrics

```typescript
import { OpenAIProvider } from '@aeye/openai';

// Track request metrics
const metrics = {
  totalRequests: 0,
  totalTokens: 0,
  totalCost: 0
};

const openai = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  hooks: {
    chat: {
      preRequest: async (request, params, ctx, metadata) => {
        metrics.totalRequests++;
        // You could also add the request to a queue or database
        console.log(`Request #${metrics.totalRequests} to model ${params.model}`);
      },
      postRequest: async (request, params, response, ctx, metadata) => {
        // Track token usage
        if (response.usage?.text) {
          const input = response.usage.text.input || 0;
          const output = response.usage.text.output || 0;
          metrics.totalTokens += input + output;
          
          // Estimate cost (example rates)
          const inputCostPer1M = 0.03; // $0.03 per 1M tokens
          const outputCostPer1M = 0.06; // $0.06 per 1M tokens
          const cost = (input * inputCostPer1M / 1_000_000) + 
                      (output * outputCostPer1M / 1_000_000);
          metrics.totalCost += cost;
        }
        
        console.log('Current metrics:', metrics);
      }
    }
  }
});
```

## Example: Error Handling and Retry Logic

```typescript
import { OpenAIProvider } from '@aeye/openai';

const openai = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  hooks: {
    chat: {
      preRequest: async (request, params, ctx, metadata) => {
        // Validate request before sending
        if (!request.messages || request.messages.length === 0) {
          throw new Error('Request must have at least one message');
        }
        
        // Log to external monitoring service with OpenAI params
        await fetch('https://monitoring.example.com/api/log', {
          method: 'POST',
          body: JSON.stringify({
            type: 'openai_request',
            timestamp: new Date().toISOString(),
            model: params.model,
            temperature: params.temperature,
            maxTokens: params.max_completion_tokens
          })
        });
      },
      postRequest: async (request, params, response, ctx, metadata) => {
        // Check for content filter issues
        if (response.finishReason === 'content_filter') {
          console.warn('Content filtered:', {
            refusal: response.refusal,
            modelUsed: params.model
          });
        }
        
        // Log successful responses
        if (response.content) {
          console.log('Response received successfully');
        }
      }
    }
  }
});
```

## Example: Streaming with Hooks

```typescript
import { OpenAIProvider } from '@aeye/openai';

const openai = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  hooks: {
    chat: {
      preRequest: async (request, params, ctx, metadata) => {
        console.log('[Stream Start]', {
          model: params.model,
          timestamp: new Date().toISOString()
        });
      },
      postRequest: async (request, params, response, ctx, metadata) => {
        // Called after streaming completes with accumulated response
        console.log('[Stream Complete]', {
          model: params.model,
          totalContent: response.content?.length,
          timestamp: new Date().toISOString()
        });
      }
    }
  }
});

const ai = AI.with()
  .providers({ openai })
  .create();

// The hooks will be called for streaming as well
for await (const chunk of ai.chat.stream([
  { role: 'user', content: 'Write a poem about AI' }
])) {
  if (chunk.content) {
    process.stdout.write(chunk.content);
  }
}
```

## Available Hooks by Provider

### OpenAI Provider

All hooks receive `(request, ctx, metadata?)` for pre-request and `(request, response, ctx, metadata?)` for post-request.

- `hooks.chat` - Chat completions (both streaming and non-streaming)
- `hooks.imageGenerate` - Image generation
- `hooks.imageEdit` - Image editing
- `hooks.imageAnalyze` - Image analysis with vision models
- `hooks.transcribe` - Audio transcription
- `hooks.speech` - Text-to-speech
- `hooks.embed` - Text embeddings

### OpenRouter Provider

Inherits all hooks from OpenAI provider since it extends the OpenAI provider.

### Replicate Provider

Supports the following hooks (configuration added, implementation may vary):
- `hooks.chat` - Chat completions
- `hooks.imageGenerate` - Image generation
- `hooks.transcribe` - Audio transcription
- `hooks.embed` - Text embeddings

### AWS Bedrock Provider

Supports the following hooks (configuration added, implementation may vary):
- `hooks.chat` - Chat completions
- `hooks.imageGenerate` - Image generation
- `hooks.embed` - Text embeddings

## Best Practices

1. **Keep hooks lightweight** - Hooks should be fast and not block the main request flow
2. **Handle errors gracefully** - If a hook throws an error, the request will fail
3. **Use async operations carefully** - Make sure hooks complete quickly
4. **Avoid modifying requests in hooks** - Hooks are for observation, not mutation
5. **Consider privacy** - Be careful about logging sensitive information

## Use Cases

- **Debugging** - Log all requests and responses during development
- **Monitoring** - Track token usage, costs, and performance metrics
- **Auditing** - Record all API calls for compliance
- **Testing** - Verify that correct parameters are being sent
- **Rate limiting** - Track request frequency
- **Error tracking** - Send errors to monitoring services

## Notes

- Hooks are optional - providers work normally without them
- Pre-request hooks are called before the API request is made
- Post-request hooks are called after the response is received (even for streaming)
- For streaming requests, the post-request hook receives an accumulated response after all chunks are processed
- If a pre-request hook throws an error, the request is aborted
- Hooks receive the same context and metadata that were passed to the original function call
