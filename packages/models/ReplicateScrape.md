I've extracted model metadata from Replicate. 

I want you to consume one model chunk file at a time. They are in cache/replicate-schemas-chunk-#.json. Each model has latest_version and in the components of the schema has Input & Output. You need to do one at a time because each file is ~ 20k tokens.

What you need to do is replace/create a src/replicate.ts file with all model handlers that make sense for each model. A model handler allows you to link a particular model ID with a set of supported functions. Like chat prediction, image generation, etc.

Here's the shape of the ModelHandler from the `@aits/ai` package:

```ts
export interface ModelTransformer<TContext = {}> {
  chat?: {
    convertRequest?: (request: Request, ctx: TContext) => unknown;
    parseResponse?: (response: unknown, ctx: TContext) => Response;
    parseChunk?: (chunk: unknown, ctx: TContext) => Chunk;
  };

  imageGenerate?: {
    convertRequest?: (request: ImageGenerationRequest, ctx: TContext) => unknown;
    parseResponse?: (response: unknown, ctx: TContext) => ImageGenerationResponse;
    parseChunk?: (chunk: unknown, ctx: TContext) => ImageGenerationChunk;
  };

  imageEdit?: {
    convertRequest?: (request: ImageEditRequest, ctx: TContext) => unknown;
    parseResponse?: (response: unknown, ctx: TContext) => ImageGenerationResponse;
    parseChunk?: (chunk: unknown, ctx: TContext) => ImageGenerationChunk;
  };

  imageAnalyze?: {
    convertRequest?: (request: ImageAnalyzeRequest, ctx: TContext) => unknown;
    parseResponse?: (response: unknown, ctx: TContext) => Response;
  };

  transcribe?: {
    convertRequest?: (request: TranscriptionRequest, ctx: TContext) => unknown;
    parseResponse?: (response: unknown, ctx: TContext) => TranscriptionResponse;
    parseChunk?: (chunk: unknown, ctx: TContext) => TranscriptionChunk;
  };

  speech?: {
    convertRequest?: (request: SpeechRequest, ctx: TContext) => unknown;
    parseResponse?: (response: unknown, ctx: TContext) => SpeechResponse;
  };

  embed?: {
    convertRequest?: (request: EmbeddingRequest, ctx: TContext) => unknown;
    parseResponse?: (response: unknown, ctx: TContext) => EmbeddingResponse;
  };
}
```

You MUST match the exact types in the above signatures:
- packages/core/src/types.ts
- packages/aicore/src/types.ts