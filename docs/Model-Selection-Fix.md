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

**Pass selected model through context metadata** so providers can access it. This is the cleanest solution because:

1. ✅ Doesn't require changing request types (backwards compatible)
2. ✅ Context already flows through the entire call chain
3. ✅ Follows existing patterns (chat executors use `metadata.model`)
4. ✅ Allows `request.model` to remain as explicit override

### Priority Order (Fallback Hierarchy)

The model resolution order will be:
1. **Explicit override**: `request.model` (highest priority - user knows exactly what they want)
2. **Selected model**: `ctx.metadata.model` (from model selection system)
3. **Default fallback**: Provider-specific default (e.g., `dall-e-3`)

This ensures:
- Users can still explicitly specify a model and bypass selection
- Model selection system is respected when no explicit model given
- System never fails due to missing model

---

## Implementation Plan

### 1. **Update BaseAPI to inject model into context**

**File**: `packages/ai/src/apis/base.ts`

**Location 1**: In `get()` method, after line 80 (after `onModelSelected` hook):

```typescript
// Run onModelSelected hook
const finalSelected = (await hooks.onModelSelected?.(fullCtx, selected)) || selected;

// NEW: Inject selected model into context metadata
fullCtx.metadata = {
  ...fullCtx.metadata,
  model: finalSelected.model.id
};

// Validate provider capability
this.validateProviderCapability(finalSelected);
```

**Location 2**: In `stream()` method, around line 155 (similar location):

```typescript
// Run onModelSelected hook
const finalSelected = (await hooks.onModelSelected?.(fullCtx, selected)) || selected;

// NEW: Inject selected model into context metadata
fullCtx.metadata = {
  ...fullCtx.metadata,
  model: finalSelected.model.id
};

// Validate provider streaming capability
this.validateProviderStreamingCapability(finalSelected);
```

### 2. **Update OpenAI Provider Methods**

**File**: `packages/openai/src/openai.ts`

Change all methods to check context metadata first, then request, then fallback.

#### A. Image Generation (line ~988)

```typescript
// OLD:
const model = request.model || 'dall-e-3';

// NEW:
const model = request.model || (_ctx as any)?.metadata?.model || 'dall-e-3';
```

#### B. Image Editing (line ~1050)

```typescript
// OLD:
const model = request.model || 'dall-e-2';

// NEW:
const model = request.model || (_ctx as any)?.metadata?.model || 'dall-e-2';
```

#### C. Image Generation Stream (line ~1200)

```typescript
// Inside generateImageStream function
// OLD:
const model = request.model || 'dall-e-3';

// NEW:
const model = request.model || (_ctx as any)?.metadata?.model || 'dall-e-3';
```

#### D. Image Edit Stream (line ~1121)

```typescript
// Inside editImageStream function
// OLD:
const model = request.model || 'dall-e-2';

// NEW:
const model = request.model || (_ctx as any)?.metadata?.model || 'dall-e-2';
```

#### E. Transcription (line ~1345)

```typescript
// OLD:
const model = request.model || 'whisper-1';

// NEW:
const model = request.model || (_ctx as any)?.metadata?.model || 'whisper-1';
```

#### F. Transcription Stream (line ~1415 in transcribeStream)

```typescript
// Inside transcribeStream function
// OLD:
const model = request.model || 'whisper-1';

// NEW:
const model = request.model || (_ctx as any)?.metadata?.model || 'whisper-1';
```

#### G. Speech (line ~1519)

```typescript
// OLD:
const model = requestModel || 'tts-1';

// NEW:
const model = requestModel || (_ctx as any)?.metadata?.model || 'tts-1';
```

#### H. Embedding (line ~1576)

```typescript
// OLD:
let params: any = {
  model: request.model || 'text-embedding-3-small',
  // ...
};

// NEW:
let params: any = {
  model: request.model || (_ctx as any)?.metadata?.model || 'text-embedding-3-small',
  // ...
};
```

#### I. Image Analyze (if applicable, check around line ~1630)

Check if there's a similar pattern and update if needed.

### 3. **Update Type Definitions (Documentation)**

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
   * Priority: request.model > selected model > provider default
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
   * Priority: request.model > selected model > provider default
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
   * Priority: request.model > selected model > provider default
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
   * Priority: request.model > selected model > provider default
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
   * Priority: request.model > selected model > provider default
   */
  model?: string;

  // ... rest of fields
}
```

### 4. **Check Other Providers**

#### Providers that extend OpenAI (should inherit fix automatically)

- `packages/openrouter/src/openrouter.ts` - Extends OpenAIProvider
- `packages/xai/src/xai.ts` - Extends OpenAIProvider

These should inherit the fix. Verify they don't override the affected methods.

#### Providers that may need independent fixes

- `packages/replicate/src/replicate.ts` - Check `generateImage()` method (~line 350)
- `packages/google/src/*.ts` - Check if provider exists and has these methods

For Replicate, if it has image generation, update similarly:

```typescript
async generateImage<TContext>(
  request: ImageGenerationRequest,
  ctx: TContext,
  config?: ReplicateConfig
): Promise<ImageGenerationResponse> {
  // ...

  if (!request.model) {
    throw new Error('Model must be specified for Replicate image generation');
  }

  // Consider updating to:
  const model = request.model || (ctx as any)?.metadata?.model;
  if (!model) {
    throw new Error('Model must be specified for Replicate image generation');
  }
}
```

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

### Must Edit (2 files)

1. **`packages/ai/src/apis/base.ts`**
   - Inject model into context metadata
   - 2 locations: `get()` and `stream()` methods

2. **`packages/openai/src/openai.ts`**
   - Use model from context metadata
   - 8-9 locations across different methods:
     - `generateImage`
     - `editImage`
     - `generateImageStream`
     - `editImageStream`
     - `transcribe`
     - `transcribeStream`
     - `speech`
     - `embed`
     - `analyzeImage` (if applicable)

### Should Update (1 file)

3. **`packages/ai/src/types.ts`**
   - Add JSDoc comments explaining model resolution
   - 5 request types:
     - `ImageGenerationRequest`
     - `ImageEditRequest`
     - `TranscriptionRequest`
     - `SpeechRequest`
     - `EmbeddingRequest`

### Should Check (3+ files)

4. **`packages/replicate/src/replicate.ts`**
   - Check if `generateImage()` needs same fix
   - Update if method exists

5. **`packages/google/src/*.ts`**
   - Check if provider exists
   - Check if has image/speech/transcription methods
   - Update if needed

6. **Inherited providers**
   - `packages/openrouter/src/openrouter.ts`
   - `packages/xai/src/xai.ts`
   - Verify they inherit fix correctly

---

## Implementation Checklist

- [ ] Update `BaseAPI.get()` to inject model into context
- [ ] Update `BaseAPI.stream()` to inject model into context
- [ ] Update OpenAI `generateImage()` to use context model
- [ ] Update OpenAI `editImage()` to use context model
- [ ] Update OpenAI `generateImageStream()` to use context model
- [ ] Update OpenAI `editImageStream()` to use context model
- [ ] Update OpenAI `transcribe()` to use context model
- [ ] Update OpenAI `transcribeStream()` to use context model
- [ ] Update OpenAI `speech()` to use context model
- [ ] Update OpenAI `embed()` to use context model
- [ ] Add JSDoc to `ImageGenerationRequest.model`
- [ ] Add JSDoc to `ImageEditRequest.model`
- [ ] Add JSDoc to `TranscriptionRequest.model`
- [ ] Add JSDoc to `SpeechRequest.model`
- [ ] Add JSDoc to `EmbeddingRequest.model`
- [ ] Check Replicate provider
- [ ] Check Google provider
- [ ] Verify OpenRouter inherits fix
- [ ] Verify xAI inherits fix
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Manual testing
- [ ] Update documentation

---

## Estimated Effort

- **Complexity**: Low (simple code changes)
- **Risk**: Low (backwards compatible)
- **Time**: 1-2 hours implementation + 1-2 hours testing
- **Total Edits**: ~15-20 simple one-line changes

---

## Future Enhancements

After this fix, consider:

1. **Type-safe metadata**: Add `model` field to `AIContext` type definition
2. **Provider scoring**: Implement the capability scoring from Image-Generation-Enhancement-1.md
3. **Better defaults**: Use model registry to get provider's default model
4. **Deprecation warnings**: Warn when selection is bypassed by fallback
