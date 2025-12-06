# @aeye/openai

OpenAI provider for the @aeye (AI TypeScript) framework. This package provides a comprehensive integration with OpenAI's API, supporting the full range of capabilities including chat completions, image generation, speech synthesis, transcription, and embeddings.

## Features

- **Chat Completions**: Support for GPT-4, GPT-4 Turbo, GPT-3.5 Turbo, and other chat models
- **Vision**: GPT-4 Vision (GPT-4V) for image understanding
- **Reasoning Models**: o1, o1-mini, o3-mini for advanced reasoning tasks
- **Image Generation**: DALL-E 2 and DALL-E 3 for creating images from text
- **Speech-to-Text**: Whisper models for audio transcription
- **Text-to-Speech**: TTS models for voice synthesis
- **Embeddings**: Text embeddings for semantic search and similarity
- **Function Calling**: Tool/function calling with automatic schema conversion
- **Structured Outputs**: JSON mode and schema-based structured outputs
- **Streaming**: Real-time streaming responses for chat completions
- **Multi-modal**: Support for text, images, audio, and files in conversations
- **Extensible**: Base class for OpenAI-compatible providers (Azure OpenAI, OpenRouter, etc.)

## Installation

```bash
npm install @aeye/openai @aeye/ai @aeye/core openai zod
```

## Quick Start

```typescript
import { OpenAIProvider } from '@aeye/openai';

// Create provider instance
const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Create executor
const executor = provider.createExecutor();

// Make a request
const response = await executor(
  {
    messages: [
      { role: 'user', content: 'Tell me a joke about TypeScript' }
    ]
  },
  {},
  { model: 'gpt-4' }
);

console.log(response.content);
```

## Configuration

### Basic Configuration

```typescript
import { OpenAIProvider, OpenAIConfig } from '@aeye/openai';

const config: OpenAIConfig = {
  apiKey: process.env.OPENAI_API_KEY!,
  organization: 'org-123456', // Optional: for multi-org accounts
};

const provider = new OpenAIProvider(config);
```

### Custom Base URL (for Azure OpenAI or compatible APIs)

```typescript
const provider = new OpenAIProvider({
  apiKey: process.env.AZURE_API_KEY!,
  baseURL: 'https://your-resource.openai.azure.com/openai/deployments/your-deployment',
});
```

## Usage Examples

### Chat Completions

#### Basic Chat

```typescript
const executor = provider.createExecutor();

const response = await executor(
  {
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is the capital of France?' }
    ],
    temperature: 0.7,
    maxTokens: 150,
  },
  {},
  { model: 'gpt-4' }
);

console.log(response.content);
console.log('Tokens used:', response.usage.totalTokens);
```

#### Streaming Chat

```typescript
const streamer = provider.createStreamer();

for await (const chunk of streamer(
  {
    messages: [
      { role: 'user', content: 'Write a short story about a robot' }
    ]
  },
  {},
  { model: 'gpt-4' }
)) {
  if (chunk.content) {
    process.stdout.write(chunk.content);
  }
}
```

#### Multi-turn Conversation

```typescript
const conversation = [
  { role: 'system' as const, content: 'You are a helpful assistant.' },
  { role: 'user' as const, content: 'What is TypeScript?' },
];

// First response
let response = await executor(
  { messages: conversation },
  {},
  { model: 'gpt-4' }
);

conversation.push({ role: 'assistant', content: response.content });
conversation.push({ role: 'user', content: 'Can you give me an example?' });

// Second response
response = await executor(
  { messages: conversation },
  {},
  { model: 'gpt-4' }
);
```

### Vision (GPT-4V)

#### Analyze an Image

```typescript
const response = await executor(
  {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', content: 'What is in this image?' },
          {
            type: 'image',
            content: 'https://example.com/image.jpg',
            // Or use base64: content: 'data:image/jpeg;base64,/9j/4AAQ...'
          }
        ]
      }
    ]
  },
  {},
  { model: 'gpt-4-vision-preview' }
);
```

#### Multiple Images

```typescript
const response = await executor(
  {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', content: 'Compare these two images' },
          { type: 'image', content: 'https://example.com/image1.jpg' },
          { type: 'image', content: 'https://example.com/image2.jpg' }
        ]
      }
    ]
  },
  {},
  { model: 'gpt-4-vision-preview' }
);
```

### Function Calling

#### Define and Use Tools

```typescript
import z from 'zod';

const response = await executor(
  {
    messages: [
      { role: 'user', content: 'What is the weather like in San Francisco?' }
    ],
    tools: [
      {
        name: 'get_current_weather',
        description: 'Get the current weather in a given location',
        parameters: z.object({
          location: z.string().describe('The city and state, e.g., San Francisco, CA'),
          unit: z.enum(['celsius', 'fahrenheit']).optional(),
        }),
      }
    ],
    toolChoice: 'auto', // Can be 'auto', 'required', 'none', or { tool: 'tool_name' }
  },
  {},
  { model: 'gpt-4' }
);

if (response.toolCalls) {
  for (const toolCall of response.toolCalls) {
    console.log('Tool:', toolCall.name);
    console.log('Arguments:', JSON.parse(toolCall.arguments));

    // Execute the function and send result back
    const functionResult = await getWeather(JSON.parse(toolCall.arguments));

    const finalResponse = await executor(
      {
        messages: [
          { role: 'user', content: 'What is the weather like in San Francisco?' },
          { role: 'assistant', content: '', toolCalls: [toolCall] },
          {
            role: 'tool',
            content: JSON.stringify(functionResult),
            toolCallId: toolCall.id,
          }
        ]
      },
      {},
      { model: 'gpt-4' }
    );
  }
}
```

#### Force Specific Tool

```typescript
const response = await executor(
  {
    messages: [
      { role: 'user', content: 'Get the weather for Boston' }
    ],
    tools: [
      {
        name: 'get_weather',
        description: 'Get weather information',
        parameters: z.object({
          location: z.string(),
        }),
      }
    ],
    toolChoice: { tool: 'get_weather' }, // Force this specific tool
  },
  {},
  { model: 'gpt-4' }
);
```

### Structured Outputs

#### JSON Mode

```typescript
const response = await executor(
  {
    messages: [
      {
        role: 'user',
        content: 'List three famous scientists and their main contributions in JSON format'
      }
    ],
    responseFormat: 'json', // Ensures valid JSON output
  },
  {},
  { model: 'gpt-4' }
);

const scientists = JSON.parse(response.content);
```

#### Schema-based Structured Output

```typescript
import z from 'zod';

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
  occupation: z.string(),
  hobbies: z.array(z.string()),
});

const response = await executor(
  {
    messages: [
      {
        role: 'user',
        content: 'Generate a profile for a fictional software engineer'
      }
    ],
    responseFormat: PersonSchema, // Strict schema enforcement
  },
  {},
  { model: 'gpt-4' }
);

// Response is guaranteed to match the schema
const person = JSON.parse(response.content);
console.log(person.name, person.age); // Type-safe
```

### Image Generation (DALL-E)

#### Generate with DALL-E 3

```typescript
const imageResponse = await provider.generateImage(
  {
    prompt: 'A serene landscape with mountains and a lake at sunset',
    model: 'dall-e-3',
    size: '1024x1024',
    quality: 'hd', // 'standard' or 'hd'
    style: 'vivid', // 'vivid' or 'natural'
    n: 1,
  },
  {}
);

console.log('Generated image URL:', imageResponse.images[0].url);
console.log('Revised prompt:', imageResponse.images[0].revisedPrompt);
```

#### Generate Multiple Images with DALL-E 2

```typescript
const imageResponse = await provider.generateImage(
  {
    prompt: 'A cute robot playing with a puppy',
    model: 'dall-e-2',
    size: '512x512',
    n: 3, // Generate 3 variations
  },
  {}
);

imageResponse.images.forEach((img, i) => {
  console.log(`Image ${i + 1}:`, img.url);
});
```

#### Get Base64 Image Data

```typescript
const imageResponse = await provider.generateImage(
  {
    prompt: 'A futuristic city skyline',
    model: 'dall-e-3',
    responseFormat: 'b64_json', // Get base64 instead of URL
  },
  {}
);

const base64Image = imageResponse.images[0].b64_json;
// Save or process the base64 data
```

### Speech Synthesis (TTS)

#### Generate Speech

```typescript
import fs from 'fs';

const speechResponse = await provider.generateSpeech(
  {
    text: 'Hello! This is a text-to-speech example using OpenAI.',
    model: 'tts-1', // or 'tts-1-hd' for higher quality
    voice: 'alloy', // alloy, echo, fable, onyx, nova, shimmer
    speed: 1.0, // 0.25 to 4.0
    responseFormat: 'mp3', // mp3, opus, aac, flac, wav, pcm
  },
  {}
);

// Save to file
fs.writeFileSync('output.mp3', speechResponse.audioBuffer);
console.log('Audio saved to output.mp3');
```

#### Different Voices

```typescript
const voices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

for (const voice of voices) {
  const response = await provider.generateSpeech(
    {
      text: `This is the ${voice} voice speaking.`,
      voice,
      model: 'tts-1',
    },
    {}
  );

  fs.writeFileSync(`voice_${voice}.mp3`, response.audioBuffer);
}
```

### Transcription (Whisper)

#### Transcribe Audio File

```typescript
import fs from 'fs';

const audioBuffer = fs.readFileSync('audio.mp3');

const transcription = await provider.transcribe(
  {
    audio: audioBuffer,
    model: 'whisper-1',
    language: 'en', // Optional: ISO-639-1 language code
    prompt: 'This is a podcast about AI and technology', // Optional: context
  },
  {}
);

console.log('Transcription:', transcription.text);
```

#### Transcribe with Timestamps

```typescript
const transcription = await provider.transcribe(
  {
    audio: audioBuffer,
    model: 'whisper-1',
    responseFormat: 'verbose_json',
    timestampGranularities: ['word', 'segment'],
  },
  {}
);

console.log('Full text:', transcription.text);
console.log('Language:', transcription.language);
console.log('Duration:', transcription.duration);

// Word-level timestamps
transcription.words?.forEach(word => {
  console.log(`${word.word}: ${word.start}s - ${word.end}s`);
});

// Segment-level timestamps
transcription.segments?.forEach(segment => {
  console.log(`${segment.text}: ${segment.start}s - ${segment.end}s`);
});
```

#### Different Output Formats

```typescript
// Plain text
const text = await provider.transcribe(
  { audio: audioBuffer, responseFormat: 'text' },
  {}
);

// SRT subtitles
const srt = await provider.transcribe(
  { audio: audioBuffer, responseFormat: 'srt' },
  {}
);

// VTT subtitles
const vtt = await provider.transcribe(
  { audio: audioBuffer, responseFormat: 'vtt' },
  {}
);
```

### Embeddings

#### Generate Embeddings

```typescript
const embeddingResponse = await provider.embed(
  {
    texts: [
      'The quick brown fox jumps over the lazy dog',
      'Machine learning is a subset of artificial intelligence',
      'OpenAI develops advanced AI models'
    ],
    model: 'text-embedding-3-small', // or 'text-embedding-3-large'
  },
  {}
);

embeddingResponse.embeddings.forEach((item, i) => {
  console.log(`Embedding ${i}:`, item.embedding.length, 'dimensions');
});

console.log('Tokens used:', embeddingResponse.usage?.text?.input);
```

#### Custom Dimensions (for smaller embeddings)

```typescript
const embeddingResponse = await provider.embed(
  {
    texts: ['Some text to embed'],
    model: 'text-embedding-3-large',
    dimensions: 256, // Reduce from default 3072 to 256
  },
  {}
);
```

#### Calculate Similarity

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

const response = await provider.embed(
  {
    texts: [
      'I love programming in TypeScript',
      'TypeScript is my favorite language',
      'I enjoy cooking Italian food'
    ],
    model: 'text-embedding-3-small',
  },
  {}
);

const [emb1, emb2, emb3] = response.embeddings.map(e => e.embedding);

console.log('Similarity 1-2:', cosineSimilarity(emb1, emb2)); // High similarity
console.log('Similarity 1-3:', cosineSimilarity(emb1, emb3)); // Low similarity
```

### Reasoning Models (o1, o3-mini)

#### Using o1 Models

The o1 and o3-mini models use extended thinking to solve complex problems.

```typescript
const response = await executor(
  {
    messages: [
      {
        role: 'user',
        content: 'Solve this logic puzzle: There are 100 doors, all closed. You make 100 passes. On pass 1, toggle all doors. On pass 2, toggle every 2nd door. On pass 3, toggle every 3rd door, etc. Which doors are open after 100 passes?'
      }
    ],
    // Note: o1 models don't support temperature or system messages
  },
  {},
  { model: 'o1-preview' } // or 'o1-mini', 'o3-mini'
);

console.log('Reasoning:', response.reasoning); // Internal reasoning process
console.log('Answer:', response.content);
```

**Important**: o1 models have different capabilities:
- No system messages support (use user messages instead)
- No temperature control (model uses internal reasoning)
- No streaming support
- Extended processing time for complex problems

### Advanced Features

#### Abort Requests

```typescript
const controller = new AbortController();

// Set timeout
setTimeout(() => controller.abort(), 5000);

try {
  const response = await executor(
    { messages: [{ role: 'user', content: 'Tell me a long story' }] },
    {},
    { model: 'gpt-4' },
    controller.signal
  );
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request was aborted');
  }
}
```

#### List Available Models

```typescript
const models = await provider.listModels();

models.forEach(model => {
  console.log(`${model.id}: ${model.capabilities}`);
  console.log(`  Context window: ${model.contextWindow}`);
  console.log(`  Pricing: $${model.pricing.text.input}/1M input tokens`);
});
```

#### Check Provider Health

```typescript
const isHealthy = await provider.checkHealth();
console.log('OpenAI API is', isHealthy ? 'accessible' : 'not accessible');
```

#### Default Metadata

```typescript
// Set default metadata for all requests
provider.defaultMetadata = {
  model: 'gpt-4',
  user: 'user-123',
};

// Now model is automatically set
const response = await executor(
  { messages: [{ role: 'user', content: 'Hello' }] },
  {}
  // No need to pass { model: 'gpt-4' }
);
```

## Extending for Custom Providers

The `OpenAIProvider` class can be extended to support OpenAI-compatible APIs like Azure OpenAI, OpenRouter, or custom deployments.

### Example: Custom Provider

```typescript
import { OpenAIProvider, OpenAIConfig } from '@aeye/openai';
import OpenAI from 'openai';

interface CustomConfig extends OpenAIConfig {
  customOption?: string;
}

class CustomProvider extends OpenAIProvider<CustomConfig> {
  readonly name = 'custom-provider';

  protected createClient(config: CustomConfig): OpenAI {
    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: 'https://api.custom-provider.com/v1',
      defaultHeaders: {
        'X-Custom-Header': config.customOption || '',
      },
    });
  }

  protected customizeChatParams(params: any, config: CustomConfig, request: any) {
    // Add custom parameters
    return {
      ...params,
      custom_param: config.customOption,
    };
  }
}

// Use the custom provider
const customProvider = new CustomProvider({
  apiKey: process.env.CUSTOM_API_KEY!,
  customOption: 'value',
});
```

### Example: Azure OpenAI

```typescript
class AzureOpenAIProvider extends OpenAIProvider {
  readonly name = 'azure-openai';

  protected createClient(config: OpenAIConfig): OpenAI {
    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL, // Azure endpoint
      defaultQuery: { 'api-version': '2024-02-01' },
    });
  }
}

const azureProvider = new AzureOpenAIProvider({
  apiKey: process.env.AZURE_OPENAI_KEY!,
  baseURL: 'https://your-resource.openai.azure.com/openai/deployments/your-deployment',
});
```

## Configuration Options

### OpenAIConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `apiKey` | `string` | Yes | OpenAI API key |
| `baseURL` | `string` | No | Custom base URL for API endpoint |
| `organization` | `string` | No | OpenAI organization ID |

### Request Parameters

#### Chat Completion Request

| Parameter | Type | Description |
|-----------|------|-------------|
| `messages` | `Message[]` | Array of conversation messages |
| `temperature` | `number` | Sampling temperature (0-2) |
| `topP` | `number` | Nucleus sampling parameter |
| `maxTokens` | `number` | Maximum tokens to generate |
| `stop` | `string \| string[]` | Stop sequences |
| `tools` | `Tool[]` | Function definitions for tool calling |
| `toolChoice` | `'auto' \| 'required' \| 'none' \| { tool: string }` | Tool selection mode |
| `responseFormat` | `'text' \| 'json' \| ZodSchema` | Response format constraint |

#### Image Generation Request

| Parameter | Type | Description |
|-----------|------|-------------|
| `prompt` | `string` | Text description of desired image |
| `model` | `string` | Model to use (dall-e-2, dall-e-3) |
| `size` | `string` | Image size (512x512, 1024x1024, etc.) |
| `quality` | `'standard' \| 'hd'` | Image quality (DALL-E 3 only) |
| `style` | `'vivid' \| 'natural'` | Image style (DALL-E 3 only) |
| `n` | `number` | Number of images to generate |
| `responseFormat` | `'url' \| 'b64_json'` | Response format |

#### Transcription Request

| Parameter | Type | Description |
|-----------|------|-------------|
| `audio` | `Buffer \| string \| Blob` | Audio file to transcribe |
| `model` | `string` | Model to use (whisper-1) |
| `language` | `string` | ISO-639-1 language code |
| `prompt` | `string` | Context for better accuracy |
| `responseFormat` | `'json' \| 'text' \| 'srt' \| 'vtt' \| 'verbose_json'` | Output format |
| `timestampGranularities` | `('word' \| 'segment')[]` | Timestamp detail level |
| `temperature` | `number` | Sampling temperature |

#### Speech Synthesis Request

| Parameter | Type | Description |
|-----------|------|-------------|
| `text` | `string` | Text to convert to speech |
| `model` | `string` | Model to use (tts-1, tts-1-hd) |
| `voice` | `string` | Voice ID (alloy, echo, fable, onyx, nova, shimmer) |
| `speed` | `number` | Playback speed (0.25-4.0) |
| `responseFormat` | `'mp3' \| 'opus' \| 'aac' \| 'flac' \| 'wav' \| 'pcm'` | Audio format |

#### Embedding Request

| Parameter | Type | Description |
|-----------|------|-------------|
| `texts` | `string[]` | Texts to embed |
| `model` | `string` | Model to use (text-embedding-3-small, text-embedding-3-large, text-embedding-ada-002) |
| `dimensions` | `number` | Output dimensions (embedding-3 models only) |
| `encodingFormat` | `'float' \| 'base64'` | Encoding format |

## Error Handling

The provider throws specific error types for different failure scenarios:

```typescript
import { ProviderError, RateLimitError, ProviderAuthError } from '@aeye/openai';

try {
  const response = await executor(
    { messages: [{ role: 'user', content: 'Hello' }] },
    {},
    { model: 'gpt-4' }
  );
} catch (error) {
  if (error instanceof RateLimitError) {
    console.error('Rate limit exceeded');
    if (error.retryAfter) {
      console.log(`Retry after ${error.retryAfter} seconds`);
    }
  } else if (error instanceof ProviderAuthError) {
    console.error('Authentication failed - check your API key');
  } else if (error instanceof ProviderError) {
    console.error(`Provider error: ${error.message}`);
    console.error('Original error:', error.cause);
  }
}
```

### Error Types

- **`ProviderError`**: Base error for all provider-related errors
- **`ProviderAuthError`**: Authentication/authorization failures
- **`RateLimitError`**: Rate limit exceeded (includes `retryAfter` if available)
- **`ProviderRateLimitError`**: Specialized rate limit error
- **`ProviderQuotaError`**: Quota/usage limit exceeded

## API Reference

### OpenAIProvider

Main provider class implementing the @aeye Provider interface.

**Constructor**: `new OpenAIProvider(config: OpenAIConfig)`

**Methods**:
- `listModels(config?: TConfig): Promise<ModelInfo[]>` - List available models
- `checkHealth(config?: TConfig): Promise<boolean>` - Check API health
- `createExecutor<TContext, TMetadata>(config?: TConfig): Executor` - Create chat executor
- `createStreamer<TContext, TMetadata>(config?: TConfig): Streamer` - Create streaming executor
- `generateImage<TContext>(request, ctx, config?): Promise<ImageGenerationResponse>` - Generate images
- `transcribe<TContext>(request, ctx, config?): Promise<TranscriptionResponse>` - Transcribe audio
- `generateSpeech<TContext>(request, ctx, config?): Promise<SpeechResponse>` - Generate speech
- `embed<TContext>(request, ctx, config?): Promise<EmbeddingResponse>` - Generate embeddings

**Protected Methods** (for extending):
- `createClient(config): OpenAI` - Create OpenAI client
- `convertModel(model): ModelInfo` - Convert model format
- `convertMessages(request): OpenAI.ChatCompletionMessageParam[]` - Convert messages
- `convertTools(request): OpenAI.ChatCompletionTool[]` - Convert tools
- `convertToolChoice(request): OpenAI.ChatCompletionToolChoiceOption` - Convert tool choice
- `convertResponseFormat(request): ResponseFormat` - Convert response format
- `customizeChatParams(params, config, request)` - Customize chat params
- `customizeImageParams(params, config)` - Customize image params
- `customizeTranscriptionParams(params, config)` - Customize transcription params
- `customizeSpeechParams(params, config)` - Customize speech params
- `customizeEmbeddingParams(params, config)` - Customize embedding params

## Model Support

### Chat Models

- **GPT-4 Turbo**: `gpt-4-turbo`, `gpt-4-turbo-preview`
- **GPT-4**: `gpt-4`, `gpt-4-0613`, `gpt-4-32k`
- **GPT-4 Vision**: `gpt-4-vision-preview`, `gpt-4-turbo-2024-04-09`
- **GPT-3.5 Turbo**: `gpt-3.5-turbo`, `gpt-3.5-turbo-16k`
- **Reasoning**: `o1-preview`, `o1-mini`, `o3-mini`

### Image Models

- **DALL-E 3**: `dall-e-3`
- **DALL-E 2**: `dall-e-2`

### Audio Models

- **Whisper**: `whisper-1`
- **TTS**: `tts-1`, `tts-1-hd`

### Embedding Models

- **Embedding v3**: `text-embedding-3-small`, `text-embedding-3-large`
- **Embedding v2**: `text-embedding-ada-002`

## Best Practices

1. **API Key Security**: Never hardcode API keys. Use environment variables or secure key management.

2. **Error Handling**: Always wrap API calls in try-catch blocks and handle rate limits gracefully.

3. **Streaming for Long Responses**: Use streaming for better user experience with lengthy responses.

4. **Token Management**: Monitor token usage to control costs. Use `maxTokens` to limit response length.

5. **Model Selection**: Choose the appropriate model for your use case:
   - GPT-4 for complex tasks requiring high accuracy
   - GPT-3.5 Turbo for simpler tasks and faster responses
   - o1/o3-mini for reasoning-heavy problems

6. **Function Calling**: Use structured schemas with Zod for type-safe function definitions.

7. **Retry Logic**: Implement exponential backoff for rate limit errors.

8. **Context Window**: Be aware of model context limits and truncate messages if needed.

## Related Packages

- **[@aeye/core](../core)**: Core @aeye framework types and interfaces
- **[@aeye/ai](../ai)**: AI abstractions and utilities
- **[@aeye/anthropic](../anthropic)**: Anthropic Claude provider
- **[@aeye/openrouter](../openrouter)**: OpenRouter multi-provider gateway

## License

GPL-3.0

## Contributing

Contributions are welcome! Please see the main [@aeye repository](https://github.com/ClickerMonkey/aeye) for contribution guidelines.

## Support

For issues and questions:
- GitHub Issues: https://github.com/ClickerMonkey/aeye/issues
- Documentation: https://github.com/ClickerMonkey/aeye

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.
