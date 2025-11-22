Run `npm run scrape:replicate`

I want you to consume one model chunk file at a time. They are in cache/replicate-schemas-chunk-#.json. Each model has latest_version and in the components of the schema has Input & Output. You need to do one at a time because each file is ~ 20k tokens.

What you need to do is replace/create a src/replicate.ts file with all model handlers that make sense for each model. A model handler allows you to link a particular model ID with a set of supported functions. Like chat prediction, image generation, etc.

Here's the shape of the ModelHandler from the `@aeye/ai` package:

```ts
export interface ModelTransformer {
  chat?: {
    convertRequest?: (request: Request, ctx: AIContextAny) => Promise<object>;
    parseResponse?: (response: object, ctx: AIContextAny) => Promise<Response>;
    parseChunk?: (chunk: object, ctx: AIContextAny) => Promise<Chunk>;
  };

  imageGenerate?: {
    convertRequest?: (request: ImageGenerationRequest, ctx: AIContextAny) => Promise<object>;
    parseResponse?: (response: object, ctx: AIContextAny) => Promise<ImageGenerationResponse>;
    parseChunk?: (chunk: object, ctx: AIContextAny) => Promise<ImageGenerationChunk>;
  };

  imageEdit?: {
    convertRequest?: (request: ImageEditRequest, ctx: AIContextAny) => Promise<object>;
    parseResponse?: (response: object, ctx: AIContextAny) => Promise<ImageGenerationResponse>;
    parseChunk?: (chunk: object, ctx: AIContextAny) => Promise<ImageGenerationChunk>;
  };

  imageAnalyze?: {
    convertRequest?: (request: ImageAnalyzeRequest, ctx: AIContextAny) => Promise<object>;
    parseResponse?: (response: object, ctx: AIContextAny) => Promise<Response>;
    parseChunk?: (chunk: object, ctx: AIContextAny) => Promise<Chunk>;
  };

  transcribe?: {
    convertRequest?: (request: TranscriptionRequest, ctx: AIContextAny) => Promise<object>;
    parseResponse?: (response: object, ctx: AIContextAny) => Promise<TranscriptionResponse>;
    parseChunk?: (chunk: object, ctx: AIContextAny) => Promise<TranscriptionChunk>;
  };

  speech?: {
    convertRequest?: (request: SpeechRequest, ctx: AIContextAny) => Promise<object>;
    parseResponse?: (response: object, ctx: AIContextAny) => Promise<SpeechResponse>;
  };

  embed?: {
    convertRequest?: (request: EmbeddingRequest, ctx: AIContextAny) => Promise<object>;
    parseResponse?: (response: object, ctx: AIContextAny) => Promise<EmbeddingResponse>;
  };
}
```

And here are the referenced types:
```ts
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';
export interface Message { 
  role: MessageRole;
  content: string | MessageContent[];
  tokens?: number;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  refusal?: string;
  cache?: Record<string, any>;
}
export type MessageContentType = 'text' | 'image' | 'file' | 'audio';
export interface MessageContent {
  type: MessageContentType;
  content: Resource;
  format?: string;
}
export interface ToolDefinition {
  name: string;
  description?: string;
  parameters: z.ZodType<object>;
  strict?: boolean;
}
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}
export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { tool: string };
export type ResponseFormat =
  | 'text'
  | 'json'
  | { type: z.ZodType<object, object>, strict: boolean };
export interface Usage {
  text?: {
    input?: number;
    output?: number;
    cached?: number;
  };
  audio?: {
    input?: number;
    output?: number;
    seconds?: number;
  };
  image?: {
    input?: number;
    output?: {
      quality: string;
      size: { width: number; height: number; };
      count: number;
    }[];
  };
  reasoning?: {
    input?: number;
    output?: number;
    cached?: number;
  };
  embeddings?: {
    count?: number;
    tokens?: number;
  };
  cost?: number;
}
export type ReasoningEffort = 'low' | 'medium' | 'high';
export interface Request extends BaseRequest {
  name?: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string | string[];
  logProbabilities?: boolean;
  logitBias?: Record<string, number>;
  tools?: ToolDefinition[];
  toolsOneAtATime?: boolean;
  toolChoice?: ToolChoice;
  responseFormat?: ResponseFormat;
  reason?: { effort?: ReasoningEffort, maxTokens?: number };
  cacheKey?: string;
  userKey?: string;
}
export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'refusal';
export interface Model {
  id: string;
  contextWindow?: number;
  maxOutputTokens?: number;
}
export type ModelInput = string | Model;
export interface BaseRequest {
  model?: ModelInput;
  extra?: Record<string, any>;
}
export interface BaseResponse {
  usage?: Usage;
  model: ModelInput;
}
export interface BaseChunk {
  usage?: Usage;
  model?: ModelInput;
}
export interface Response extends BaseResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason: FinishReason;
  refusal?: string;
  reasoning?: string;
}
export interface Chunk extends BaseChunk {
  content?: string;
  toolCallNamed?: ToolCall;
  toolCallArguments?: ToolCall;
  toolCall?: ToolCall;
  finishReason?: FinishReason;
  refusal?: string;
  reasoning?: string;
}
export interface ImageGenerationRequest extends BaseRequest {
  prompt: string;
  n?: number;
  size?: string;
  quality?: 'low' | 'medium' | 'high';
  style?: 'vivid' | 'natural'; 
  responseFormat?: 'url' | 'b64_json';
  background?: 'transparent' | 'opaque' | 'auto';
  streamCount?: number;
  seed?: number;
  userIdentifier?: string;
}
export interface ImageEditRequest extends BaseRequest {
  prompt: string;
  image: Resource;
  mask?: Resource;
  n?: number;
  size?: string;
  responseFormat?: 'url' | 'b64_json';
  seed?: number;
  streamCount?: number;
  userIdentifier?: string;
}
export interface ImageGenerationResponse extends BaseResponse {
  images: Array<{
    url?: string;
    b64_json?: string;
    revisedPrompt?: string;
  }>;
}
export interface ImageGenerationChunk extends BaseChunk {
  imageData?: string;
  progress?: number;
  done?: boolean;
  image?: {
    url?: string;
    b64_json?: string;
  };
}
export interface TranscriptionRequest extends BaseRequest {
  audio: Resource;
  language?: string;
  prompt?: string;
  temperature?: number;
  responseFormat?: 'json' | 'text' | 'srt' | 'vtt' | 'verbose_json';
  timestampGranularities?: Array<'word' | 'segment'>;
}
export interface TranscriptionResponse extends BaseResponse {
  text: string;
}
export interface TranscriptionChunk extends BaseChunk {
  delta?: string;
  text?: string;
  segment?: { start: number; end: number; speaker: string, text: string, id: string };
  status?: string;
}
export interface SpeechRequest extends BaseRequest{
  text: string;
  instructions?: string;
  voice?: string;
  speed?: number;
  responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
}
export interface SpeechResponse extends BaseResponse {
  audio: ReadableStream<any>;
  responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
}
export interface EmbeddingRequest extends BaseRequest {
  texts: string[];
  dimensions?: number;
  encodingFormat?: 'float' | 'base64';
  userIdentifier?: string;
}
export interface EmbeddingResponse extends BaseResponse {
  embeddings: Array<{
    embedding: number[];
    index: number;
  }>;
}
export interface ImageAnalyzeRequest extends BaseRequest{
  prompt: string;
  images: string[];
  maxTokens?: number;
  temperature?: number;
}
export type Resource = 
 | string // plain text, or data URL, or http(s) URL, or file:// URL
 | AsyncIterable<Uint8Array> // fs.ReadStream, ReadableStream
 | Blob // File
 | Uint8Array 
 | URL
 | ArrayBuffer
 | DataView
 | Buffer
 | { blob(): Promise<Blob> | Blob }
 | { url(): string }
 | { read(): Promise<ReadableStream> | ReadableStream }
```
