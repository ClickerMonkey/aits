# Fix Model Selection for Image, Speech, and Transcription APIs

## Problem Summary

Model selection currently doesn't work for image generation, transcription, speech, and embedding APIs. The system selects a model through the registry but providers ignore it and use fallback defaults:

- **Image Generation**: Always uses `dall-e-3` (openai.ts:988)
- **Image Editing**: Always uses `dall-e-2` (openai.ts:1050)
- **Transcription**: Always uses `whisper-1` (openai.ts:1345)
- **Speech**: Always uses `tts-1` (openai.ts:1519)
- **Embedding**: Always uses `text-embedding-3-small` (openai.ts:1576)

The selected model is available in `selected.model.id` but never reaches the provider methods.

### Why This Happens

The flow looks like this:

```typescript
// 1. Model selection happens in BaseAPI
const selected = this.ai.selectModel(metadata); // ✅ Selects "dall-e-2"

// 2. Provider method is called
await selected.provider.generateImage!(request, ctx, config);

// 3. But provider ignores the selection!
const model = request.model || 'dall-e-3'; // ❌ Uses dall-e-3!
```

The `SelectedModel` object contains the right model, but there's no mechanism to pass it to the provider method.

---

## Solution Approach

**Use a structured `getModel()` method and properly typed context** to enable model resolution at the provider level. This is the cleanest solution because:

1. ✅ Doesn't require changing request types (backwards compatible)
2. ✅ Type-safe access to context metadata (no casting)
3. ✅ Clear contract via `getModel()` method on BaseAPI
4. ✅ Allows `request.model` to remain as explicit override
5. ✅ Model selection only runs if needed (optimization)

### Priority Order (Fallback Hierarchy)

The model resolution order will be:
1. **Explicit override**: `request.model` (highest priority - user knows exactly what they want)
2. **Context metadata**: `ctx.metadata.model` (from context passed in)
3. **Selected model**: Via model selection system (only if above are undefined)
4. **Default fallback**: Provider-specific default (e.g., `dall-e-3`)

This ensures:
- Users can still explicitly specify a model and bypass selection
- Context can provide model without running selection
- Model selection system is respected when no model provided
- System never fails due to missing model

### Key Design Decisions

1. **Providers are TTypes agnostic**: Change provider context type from generic `TContext` to `AIBaseContext<AIBaseTypes>`. Providers always receive base types regardless of the AI instance's TTypes configuration. This ensures `ctx.metadata.model` is always available without casting.
2. **Add `getModel()` method**: Abstract method on `BaseAPI` that each API implementation overrides to extract `model` from request
3. **Skip selection when possible**: If `getModel()` or `ctx.metadata.model` returns a model, skip the expensive model selection

---

## Implementation Plan

### 1. **Add `getModel()` method to BaseAPI**

**File**: `packages/ai/src/apis/base.ts`

Add abstract method that each API implementation must override:

```typescript
abstract class BaseAPI<TRequest, TResponse, TStreamResponse> {
  // ... existing methods ...

  /**
   * Extract model from request if present.
   * Each API implementation overrides this to access their specific request type's model field.
   * @returns model string if present in request, undefined otherwise
   */
  protected abstract getModel(request: TRequest): string | undefined;
}
```

### 2. **Update BaseAPI to check model before selection**

**File**: `packages/ai/src/apis/base.ts`

**Location 1**: In `get()` method, before `selectModel()` call:

```typescript
async get(request: TRequest, ctx?: Partial<AIBaseContext<AIBaseTypes>>): Promise<TResponse> {
  // Build context
  const fullCtx = this.buildContext(ctx);

  // Check if model is already specified
  const requestModel = this.getModel(request);
  const contextModel = fullCtx.metadata.model;

  let selected: SelectedModel;

  if (requestModel) {
    // Request model takes highest priority - skip selection
    selected = this.createSelectedModelFromId(requestModel);
  } else if (contextModel) {
    // Context metadata model - skip selection
    selected = this.createSelectedModelFromId(contextModel);
  } else {
    // No model specified - use selection system
    const metadata = { ...this.ai.config.defaultMetadata, ...fullCtx.metadata };
    selected = this.ai.selectModel(metadata);
  }

  // Inject selected model into context for provider access
  fullCtx.metadata.model = selected.model.id;

  // ... rest of method (hooks, validation, provider call)
}
```

**Location 2**: In `stream()` method (similar changes):

```typescript
async *stream(request: TRequest, ctx?: Partial<AIBaseContext<AIBaseTypes>>): AsyncIterableIterator<TStreamResponse> {
  // Build context
  const fullCtx = this.buildContext(ctx);

  // Check if model is already specified
  const requestModel = this.getModel(request);
  const contextModel = fullCtx.metadata.model;

  let selected: SelectedModel;

  if (requestModel) {
    selected = this.createSelectedModelFromId(requestModel);
  } else if (contextModel) {
    selected = this.createSelectedModelFromId(contextModel);
  } else {
    const metadata = { ...this.ai.config.defaultMetadata, ...fullCtx.metadata };
    selected = this.ai.selectModel(metadata);
  }

  fullCtx.metadata.model = selected.model.id;

  // ... rest of method
}
```

**Add helper method**:

```typescript
/**
 * Create a SelectedModel from a model ID.
 * Used when bypassing the selection system.
 */
private createSelectedModelFromId(modelId: string): SelectedModel {
  // Find the model in the registry
  const model = this.ai.registry.models.get(modelId);
  if (!model) {
    throw new Error(`Model '${modelId}' not found in registry`);
  }

  // Find the provider
  const providerName = model.provider;
  const provider = this.ai.providers.get(providerName);
  if (!provider) {
    throw new Error(`Provider '${providerName}' not found`);
  }

  return {
    model,
    provider,
    score: 1.0, // Not scored when explicitly selected
  };
}
```

### 3. **Implement `getModel()` in all API classes**

**File**: `packages/ai/src/apis/image.ts`

```typescript
export class ImageAPI extends BaseAPI<ImageGenerationRequest, ImageGenerationResponse, ImageGenerationStreamResponse> {
  // ... existing code ...

  protected getModel(request: ImageGenerationRequest): string | undefined {
    return request.model;
  }
}

export class ImageEditAPI extends BaseAPI<ImageEditRequest, ImageEditResponse, ImageEditStreamResponse> {
  // ... existing code ...

  protected getModel(request: ImageEditRequest): string | undefined {
    return request.model;
  }
}
```

**File**: `packages/ai/src/apis/transcription.ts`

```typescript
export class TranscriptionAPI extends BaseAPI<TranscriptionRequest, TranscriptionResponse, TranscriptionStreamResponse> {
  // ... existing code ...

  protected getModel(request: TranscriptionRequest): string | undefined {
    return request.model;
  }
}
```

**File**: `packages/ai/src/apis/speech.ts`

```typescript
export class SpeechAPI extends BaseAPI<SpeechRequest, SpeechResponse, SpeechStreamResponse> {
  // ... existing code ...

  protected getModel(request: SpeechRequest): string | undefined {
    return request.model;
  }
}
```

**File**: `packages/ai/src/apis/embedding.ts`

```typescript
export class EmbeddingAPI extends BaseAPI<EmbeddingRequest, EmbeddingResponse, never> {
  // ... existing code ...

  protected getModel(request: EmbeddingRequest): string | undefined {
    return request.model;
  }
}
```

**File**: `packages/ai/src/apis/chat.ts` (for completeness)

```typescript
export class ChatAPI extends BaseAPI<ChatRequest, ChatResponse, ChatStreamResponse> {
  // ... existing code ...

  protected getModel(request: ChatRequest): string | undefined {
    return request.model;
  }
}
```

### 4. **Fix Provider Context Type**

**File**: `packages/ai/src/provider.ts`

Change all provider method signatures from generic `TContext` to `AIBaseContext<AIBaseTypes>`:

```typescript
export interface AIProvider<TConfig = any> {
  // Chat
  chat?(
    request: ChatRequest,
    ctx: AIBaseContext<AIBaseTypes>,
    config?: TConfig
  ): Promise<ChatResponse>;

  chatStream?(
    request: ChatRequest,
    ctx: AIBaseContext<AIBaseTypes>,
    config?: TConfig
  ): AsyncIterableIterator<ChatStreamResponse>;

  // Image Generation
  generateImage?(
    request: ImageGenerationRequest,
    ctx: AIBaseContext<AIBaseTypes>,
    config?: TConfig
  ): Promise<ImageGenerationResponse>;

  generateImageStream?(
    request: ImageGenerationRequest,
    ctx: AIBaseContext<AIBaseTypes>,
    config?: TConfig
  ): AsyncIterableIterator<ImageGenerationStreamResponse>;

  // Image Editing
  editImage?(
    request: ImageEditRequest,
    ctx: AIBaseContext<AIBaseTypes>,
    config?: TConfig
  ): Promise<ImageEditResponse>;

  editImageStream?(
    request: ImageEditRequest,
    ctx: AIBaseContext<AIBaseTypes>,
    config?: TConfig
  ): AsyncIterableIterator<ImageEditStreamResponse>;

  // Transcription
  transcribe?(
    request: TranscriptionRequest,
    ctx: AIBaseContext<AIBaseTypes>,
    config?: TConfig
  ): Promise<TranscriptionResponse>;

  transcribeStream?(
    request: TranscriptionRequest,
    ctx: AIBaseContext<AIBaseTypes>,
    config?: TConfig
  ): AsyncIterableIterator<TranscriptionStreamResponse>;

  // Speech
  speech?(
    request: SpeechRequest,
    ctx: AIBaseContext<AIBaseTypes>,
    config?: TConfig
  ): Promise<SpeechResponse>;

  // Embedding
  embed?(
    request: EmbeddingRequest,
    ctx: AIBaseContext<AIBaseTypes>,
    config?: TConfig
  ): Promise<EmbeddingResponse>;

  // Image Analysis
  analyzeImage?(
    request: ImageAnalysisRequest,
    ctx: AIBaseContext<AIBaseTypes>,
    config?: TConfig
  ): Promise<ImageAnalysisResponse>;
}
```

**Note**: Providers should be TTypes agnostic. They always receive `AIBaseContext<AIBaseTypes>` regardless of the TTypes the AI instance is configured with. This ensures providers can access standard context properties like `metadata.model` without needing to be generic over TTypes.

### 5. **Update OpenAI Provider to use ctx.metadata.model**

**File**: `packages/openai/src/openai.ts`

Now that context is properly typed, providers can access `ctx.metadata.model` without casting:

#### A. Image Generation (line ~988)

```typescript
async generateImage(
  request: ImageGenerationRequest,
  ctx: AIBaseContext<AIBaseTypes>,
  config?: OpenAIConfig
): Promise<ImageGenerationResponse> {
  // OLD:
  const model = request.model || 'dall-e-3';

  // NEW:
  const model = request.model || ctx.metadata.model || 'dall-e-3';

  // ... rest of implementation
}
```

#### B. Image Editing (line ~1050)

```typescript
async editImage(
  request: ImageEditRequest,
  ctx: AIBaseContext<AIBaseTypes>,
  config?: OpenAIConfig
): Promise<ImageEditResponse> {
  const model = request.model || ctx.metadata.model || 'dall-e-2';
  // ... rest of implementation
}
```

#### C. Image Generation Stream (line ~1200)

```typescript
async *generateImageStream(
  request: ImageGenerationRequest,
  ctx: AIBaseContext<AIBaseTypes>,
  config?: OpenAIConfig
): AsyncIterableIterator<ImageGenerationStreamResponse> {
  const model = request.model || ctx.metadata.model || 'dall-e-3';
  // ... rest of implementation
}
```

#### D. Image Edit Stream (line ~1121)

```typescript
async *editImageStream(
  request: ImageEditRequest,
  ctx: AIBaseContext<AIBaseTypes>,
  config?: OpenAIConfig
): AsyncIterableIterator<ImageEditStreamResponse> {
  const model = request.model || ctx.metadata.model || 'dall-e-2';
  // ... rest of implementation
}
```

#### E. Transcription (line ~1345)

```typescript
async transcribe(
  request: TranscriptionRequest,
  ctx: AIBaseContext<AIBaseTypes>,
  config?: OpenAIConfig
): Promise<TranscriptionResponse> {
  const model = request.model || ctx.metadata.model || 'whisper-1';
  // ... rest of implementation
}
```

#### F. Transcription Stream (line ~1415)

```typescript
async *transcribeStream(
  request: TranscriptionRequest,
  ctx: AIBaseContext<AIBaseTypes>,
  config?: OpenAIConfig
): AsyncIterableIterator<TranscriptionStreamResponse> {
  const model = request.model || ctx.metadata.model || 'whisper-1';
  // ... rest of implementation
}
```

#### G. Speech (line ~1519)

```typescript
async speech(
  request: SpeechRequest,
  ctx: AIBaseContext<AIBaseTypes>,
  config?: OpenAIConfig
): Promise<SpeechResponse> {
  const requestModel = request.model;
  const model = requestModel || ctx.metadata.model || 'tts-1';
  // ... rest of implementation
}
```

#### H. Embedding (line ~1576)

```typescript
async embed(
  request: EmbeddingRequest,
  ctx: AIBaseContext<AIBaseTypes>,
  config?: OpenAIConfig
): Promise<EmbeddingResponse> {
  let params: any = {
    model: request.model || ctx.metadata.model || 'text-embedding-3-small',
    // ... rest
  };
  // ... rest of implementation
}
```

#### I. Image Analyze (if applicable, check around line ~1630)

```typescript
async analyzeImage(
  request: ImageAnalysisRequest,
  ctx: AIBaseContext<AIBaseTypes>,
  config?: OpenAIConfig
): Promise<ImageAnalysisResponse> {
  const model = request.model || ctx.metadata.model || 'gpt-4-vision-preview';
  // ... rest of implementation
}
```

### 6. **Update Type Definitions (Documentation)**

**File**: `packages/ai/src/types.ts`

All request types already have `model?: string` (optional). Add JSDoc comments to clarify the behavior:

#### ImageGenerationRequest (~line 460)

```typescript
export interface ImageGenerationRequest {
  // Text description of desired image
  prompt: string;

  /**
   * Optional explicit model override.
   * If not specified, the model selection system will choose the best model
   * based on capabilities, cost, and metadata criteria.
   *
   * Priority: request.model > ctx.metadata.model > selected model > provider default
   */
  model?: string;

  // ... rest of fields
}
```

#### ImageEditRequest (~line 484)

```typescript
export interface ImageEditRequest {
  // Text description of desired edits
  prompt: string;

  // Source image to edit
  image: Buffer | Uint8Array | string;

  // Optional mask indicating edit region
  mask?: Buffer | Uint8Array | string;

  /**
   * Optional explicit model override.
   * If not specified, the model selection system will choose the best model
   * based on capabilities, cost, and metadata criteria.
   *
   * Priority: request.model > ctx.metadata.model > selected model > provider default
   */
  model?: string;

  // ... rest of fields
}
```

#### TranscriptionRequest (~line 535)

```typescript
export interface TranscriptionRequest {
  // Audio data to transcribe
  audio: Buffer | ReadStream | string | File;

  /**
   * Optional explicit model override.
   * If not specified, the model selection system will choose the best model
   * based on capabilities, cost, and metadata criteria.
   *
   * Priority: request.model > ctx.metadata.model > selected model > provider default
   */
  model?: string;

  // ... rest of fields
}
```

#### SpeechRequest (~line 590)

```typescript
export interface SpeechRequest {
  // Text to convert to speech
  text: string;

  // Instructions for speech style/tone
  instructions?: string;

  /**
   * Optional explicit model override.
   * If not specified, the model selection system will choose the best model
   * based on capabilities, cost, and metadata criteria.
   *
   * Priority: request.model > ctx.metadata.model > selected model > provider default
   */
  model?: string;

  // ... rest of fields
}
```

#### EmbeddingRequest (~line 618)

```typescript
export interface EmbeddingRequest {
  // Texts to embed
  texts: string[];

  /**
   * Optional explicit model override.
   * If not specified, the model selection system will choose the best model
   * based on capabilities, cost, and metadata criteria.
   *
   * Priority: request.model > ctx.metadata.model > selected model > provider default
   */
  model?: string;

  // ... rest of fields
}
```

### 7. **Update Other Providers**

#### Providers that extend OpenAI (should inherit fix automatically)

- `packages/openrouter/src/openrouter.ts` - Extends OpenAIProvider
- `packages/xai/src/xai.ts` - Extends OpenAIProvider

These should inherit the fix. Verify they:
1. Don't override the affected methods
2. Update their context type signatures to `AIBaseContext<AIBaseTypes>` if they have custom implementations

#### Providers that need independent fixes

**File**: `packages/replicate/src/replicate.ts`

Update the `generateImage()` method signature and model resolution:

```typescript
async generateImage(
  request: ImageGenerationRequest,
  ctx: AIBaseContext<AIBaseTypes>,  // ✅ Changed from TContext
  config?: ReplicateConfig
): Promise<ImageGenerationResponse> {
  // OLD:
  if (!request.model) {
    throw new Error('Model must be specified for Replicate image generation');
  }

  // NEW:
  const model = request.model || ctx.metadata.model;
  if (!model) {
    throw new Error('Model must be specified for Replicate image generation');
  }

  // ... rest of implementation using 'model' variable
}
```

**File**: `packages/google/src/*.ts` (if exists)

Check if provider exists and has these methods. If so, update signatures to use `AIBaseContext<AIBaseTypes>` and access `ctx.metadata.model`.

---

## Testing Strategy

### Unit Tests

Test model resolution priority:

```typescript
describe('Model Selection for Image Generation', () => {
  it('should use explicit request.model (highest priority)', async () => {
    const result = await ai.image.generate.get({
      prompt: "test",
      model: "dall-e-2"
    });
    expect(result.model).toBe("dall-e-2");
  });

  it('should use selected model from metadata when no explicit model', async () => {
    const result = await ai.image.generate.get(
      { prompt: "test" },
      { metadata: { model: "dall-e-2" } }
    );
    expect(result.model).toBe("dall-e-2");
  });

  it('should fall back to default when no model specified', async () => {
    const result = await ai.image.generate.get({ prompt: "test" });
    expect(result.model).toBe("dall-e-3"); // OpenAI default
  });
});
```

### Integration Tests

Test full flow with model selection:

```typescript
describe('Model Selection Integration', () => {
  it('should respect defaultMetadata model', async () => {
    const ai = new AI({
      providers: { openai },
      defaultMetadata: {
        required: ['image'],
        model: 'dall-e-2'
      }
    });

    const result = await ai.image.generate.get({ prompt: "test" });
    expect(result.model).toBe("dall-e-2");
  });

  it('should use model selection system', async () => {
    const ai = new AI({
      providers: { openai },
      defaultMetadata: {
        required: ['image'],
        weights: { cost: 1.0 } // Prefer cheaper model
      }
    });

    // Should select based on cost
    const result = await ai.image.generate.get({ prompt: "test" });
    // Assert selected model matches cost preference
  });
});
```

### Manual Testing Checklist

- [ ] Image generation with explicit model
- [ ] Image generation with metadata model
- [ ] Image generation with no model (default)
- [ ] Image editing with explicit model
- [ ] Image editing with metadata model
- [ ] Image editing with no model (default)
- [ ] Transcription with explicit model
- [ ] Transcription with metadata model
- [ ] Transcription with no model (default)
- [ ] Speech with explicit model
- [ ] Speech with metadata model
- [ ] Speech with no model (default)
- [ ] Embedding with explicit model
- [ ] Embedding with metadata model
- [ ] Embedding with no model (default)

---

## Migration Impact

### ✅ **Fully Backward Compatible**

- No breaking changes to APIs
- All request types already have `model?: string` (optional)
- Existing code continues to work exactly as before
- `request.model` still works as explicit override

### 🎯 **Fixes Current Behavior**

- Model selection actually works now
- Cost calculations accurate (uses correct model pricing)
- Capability checking meaningful (matches selected model capabilities)
- Metadata/criteria respected (weights, providers, budget)

### 📝 **Documentation Updates Needed**

1. Update API docs to explain model resolution hierarchy
2. Add examples showing how to use model selection
3. Document that `request.model` overrides selection
4. Update migration guide with new behavior

---

## Example Usage After Fix

### Example 1: Default Metadata

#### Before (doesn't work):
```typescript
const ai = new AI({
  providers: { openai },
  defaultMetadata: { model: 'dall-e-2' }
});

// Still uses dall-e-3! ❌
const result = await ai.image.generate.get({ prompt: "cat" });
console.log(result.model); // "dall-e-3"
```

#### After (works correctly):
```typescript
const ai = new AI({
  providers: { openai },
  defaultMetadata: { model: 'dall-e-2' }
});

// Uses dall-e-2 as specified! ✅
const result = await ai.image.generate.get({ prompt: "cat" });
console.log(result.model); // "dall-e-2"
```

### Example 2: Cost-Based Selection

#### Before (doesn't work):
```typescript
const ai = new AI({
  providers: { openai },
  defaultMetadata: {
    required: ['image'],
    weights: { cost: 1.0 } // Prefer cheapest
  }
});

// Ignores cost preference, uses dall-e-3 ❌
await ai.image.generate.get({ prompt: "test" });
```

#### After (works correctly):
```typescript
const ai = new AI({
  providers: { openai },
  defaultMetadata: {
    required: ['image'],
    weights: { cost: 1.0 } // Prefer cheapest
  }
});

// Selects cheapest image model! ✅
await ai.image.generate.get({ prompt: "test" });
```

### Example 3: Explicit Override Still Works

```typescript
const ai = new AI({
  providers: { openai },
  defaultMetadata: { model: 'dall-e-2' }
});

// Explicit model always wins! ✅
const result = await ai.image.generate.get({
  prompt: "cat",
  model: "dall-e-3" // Override metadata
});
console.log(result.model); // "dall-e-3"
```

---

## Files Summary

### Core Files (Must Edit)

1. **`packages/ai/src/apis/base.ts`**
   - Add abstract `getModel()` method
   - Add `createSelectedModelFromId()` helper method
   - Update `get()` method to check request/context model before selection
   - Update `stream()` method to check request/context model before selection

2. **`packages/ai/src/provider.ts`**
   - Change all method signatures from `ctx: TContext` to `ctx: AIBaseContext<AIBaseTypes>`
   - Providers are TTypes agnostic - they always receive base types regardless of AI instance configuration
   - Affects: chat, chatStream, generateImage, generateImageStream, editImage, editImageStream, transcribe, transcribeStream, speech, embed, analyzeImage

### API Implementations (Must Edit)

3. **`packages/ai/src/apis/image.ts`**
   - Implement `getModel()` in `ImageAPI`
   - Implement `getModel()` in `ImageEditAPI`

4. **`packages/ai/src/apis/transcription.ts`**
   - Implement `getModel()` in `TranscriptionAPI`

5. **`packages/ai/src/apis/speech.ts`**
   - Implement `getModel()` in `SpeechAPI`

6. **`packages/ai/src/apis/embedding.ts`**
   - Implement `getModel()` in `EmbeddingAPI`

7. **`packages/ai/src/apis/chat.ts`**
   - Implement `getModel()` in `ChatAPI` (for completeness)

### Provider Implementations (Must Edit)

8. **`packages/openai/src/openai.ts`**
   - Update context type from `TContext` to `AIBaseContext<AIBaseTypes>` in all methods
   - Use `ctx.metadata.model` in model resolution (9 methods):
     - `generateImage`
     - `editImage`
     - `generateImageStream`
     - `editImageStream`
     - `transcribe`
     - `transcribeStream`
     - `speech`
     - `embed`
     - `analyzeImage` (if applicable)

### Documentation (Should Update)

9. **`packages/ai/src/types.ts`**
   - Add JSDoc comments to 5 request types explaining model resolution hierarchy:
     - `ImageGenerationRequest`
     - `ImageEditRequest`
     - `TranscriptionRequest`
     - `SpeechRequest`
     - `EmbeddingRequest`

### Other Providers (Should Check and Update)

10. **`packages/replicate/src/replicate.ts`**
    - Update context type signature
    - Update model resolution to check `ctx.metadata.model`

11. **`packages/openrouter/src/openrouter.ts`**
    - Verify inherits fix from OpenAIProvider
    - Update context types if has custom implementations

12. **`packages/xai/src/xai.ts`**
    - Verify inherits fix from OpenAIProvider
    - Update context types if has custom implementations

13. **`packages/google/src/*.ts`** (if exists)
    - Check if provider exists
    - Update context types and model resolution if applicable

---

## Implementation Checklist

### Core Infrastructure
- [ ] Add abstract `getModel()` method to `BaseAPI`
- [ ] Add `createSelectedModelFromId()` helper to `BaseAPI`
- [ ] Update `BaseAPI.get()` to check request/context model before selection
- [ ] Update `BaseAPI.stream()` to check request/context model before selection
- [ ] Update `AIProvider` interface - change all `TContext` to `AIBaseContext<AIBaseTypes>` (providers are TTypes agnostic)

### API Implementations
- [ ] Implement `getModel()` in `ImageAPI`
- [ ] Implement `getModel()` in `ImageEditAPI`
- [ ] Implement `getModel()` in `TranscriptionAPI`
- [ ] Implement `getModel()` in `SpeechAPI`
- [ ] Implement `getModel()` in `EmbeddingAPI`
- [ ] Implement `getModel()` in `ChatAPI`

### OpenAI Provider
- [ ] Update OpenAI `generateImage()` context type and use `ctx.metadata.model`
- [ ] Update OpenAI `editImage()` context type and use `ctx.metadata.model`
- [ ] Update OpenAI `generateImageStream()` context type and use `ctx.metadata.model`
- [ ] Update OpenAI `editImageStream()` context type and use `ctx.metadata.model`
- [ ] Update OpenAI `transcribe()` context type and use `ctx.metadata.model`
- [ ] Update OpenAI `transcribeStream()` context type and use `ctx.metadata.model`
- [ ] Update OpenAI `speech()` context type and use `ctx.metadata.model`
- [ ] Update OpenAI `embed()` context type and use `ctx.metadata.model`
- [ ] Update OpenAI `analyzeImage()` context type and use `ctx.metadata.model` (if applicable)
- [ ] Update OpenAI `chat()` context type (for consistency)
- [ ] Update OpenAI `chatStream()` context type (for consistency)

### Documentation
- [ ] Add JSDoc to `ImageGenerationRequest.model`
- [ ] Add JSDoc to `ImageEditRequest.model`
- [ ] Add JSDoc to `TranscriptionRequest.model`
- [ ] Add JSDoc to `SpeechRequest.model`
- [ ] Add JSDoc to `EmbeddingRequest.model`

### Other Providers
- [ ] Update Replicate provider context types and model resolution
- [ ] Verify OpenRouter inherits fix correctly
- [ ] Verify xAI inherits fix correctly
- [ ] Check Google provider (if exists)

### Testing
- [ ] Write unit tests for model resolution priority
- [ ] Write integration tests for full flow
- [ ] Manual testing all affected methods
- [ ] Verify backwards compatibility

### Documentation
- [ ] Update API documentation
- [ ] Update migration guide
- [ ] Add usage examples

---

## Estimated Effort

- **Complexity**: Medium (type system changes + logic updates)
- **Risk**: Low-Medium (backwards compatible for users, but changes provider interface)
- **Time**: 2-3 hours implementation + 2 hours testing
- **Total Edits**:
  - ~50 lines in `base.ts` (new methods + logic)
  - ~10 lines across API implementations (getModel methods)
  - ~25 lines in `provider.ts` (type changes)
  - ~20 lines in `openai.ts` (model resolution + type changes)
  - ~5 lines in other providers
  - ~50 lines JSDoc comments
  - **Total: ~160 lines across 13 files**

---

## Future Enhancements

After this fix, consider:

1. **Provider scoring**: Implement the capability scoring from Image-Generation-Enhancement-1.md
2. **Better defaults**: Use model registry to get provider's default model instead of hardcoded fallbacks
3. **Deprecation warnings**: Warn when selection is bypassed by fallback
4. **Model validation**: Validate that explicitly provided models exist in registry before using them
