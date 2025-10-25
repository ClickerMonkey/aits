# Image Generation Enhancement Plan

## Research Summary

Based on research of DALL-E 3, Stable Diffusion, and Replicate APIs, I've identified comprehensive parameters and dimensional standards used across AI image generation providers.

### Common Image Generation Parameters

- **Core**: prompt, negative_prompt, size/dimensions, quality, style, n (count), seed, response_format
- **Stable Diffusion**: guidance_scale (CFG 7-12), steps (25 recommended), sampler, scheduler
- **Standard Dimensions**: 1:1 (512x512, 1024x1024), 16:9 (1792x1024), 9:16 (1024x1792), 4:5, 3:2
- **Provider Specifics**:
  - DALL-E 3: 1024x1024, 1792x1024, 1024x1792, HD quality
  - DALL-E 2: 256x256-1024x1024, supports editing with masks

### Key Research Findings

**CFG Scale (Guidance Scale)**
- Controls how closely the generation follows the prompt
- Range: 2-20, recommended 7-12
- Lower = more creative/diverse, Higher = more literal/constrained
- Default: 7-7.5 for best balance

**Sampling Steps**
- Number of denoising iterations
- Range: 10-50+, recommended 20-30
- More steps = higher quality but slower
- 25 steps usually sufficient for high quality

**Aspect Ratios**
- Most common: 1:1 (square), 16:9 (landscape), 9:16 (portrait)
- Print-friendly: 3:2, 4:5, 2:3
- Platform-specific considerations for social media

---

## Implementation Plan

### 1. Enhanced Request Types (`packages/ai/src/types.ts`)

Expand `ImageGenerationRequest` and `ImageEditRequest` with universal and advanced parameters:

```typescript
export interface ImageGenerationRequest {
  // === Existing Core Parameters ===
  prompt: string;
  model?: string;
  n?: number;
  size?: string;
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  responseFormat?: 'url' | 'b64_json';
  seed?: number;
  streamCount?: number;

  // === NEW: Universal Parameters ===
  /** Negative prompt - what to avoid in generation */
  negativePrompt?: string;

  /** Aspect ratio (e.g., "16:9", "1:1", "9:16") */
  aspectRatio?: string;

  /** Explicit width in pixels */
  width?: number;

  /** Explicit height in pixels */
  height?: number;

  // === NEW: Advanced Parameters (Stable Diffusion, etc.) ===
  /** Guidance scale / CFG scale (typically 7-12) */
  guidanceScale?: number;

  /** Number of sampling/denoising steps (typically 20-50) */
  steps?: number;

  /** Sampler algorithm (e.g., "euler_a", "ddim", "dpm_solver++") */
  sampler?: string;

  /** Scheduler algorithm */
  scheduler?: string;

  /** Clip skip value (Stable Diffusion) */
  clipSkip?: number;
}

export interface ImageEditRequest {
  // Existing
  prompt: string;
  image: Buffer | Uint8Array | string;
  mask?: Buffer | Uint8Array | string;
  model?: string;
  n?: number;
  size?: string;
  responseFormat?: 'url' | 'b64_json';
  seed?: number;
  streamCount?: number;

  // NEW: Add same universal and advanced parameters as ImageGenerationRequest
  negativePrompt?: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
  guidanceScale?: number;
  steps?: number;
  sampler?: string;
  scheduler?: string;
}
```

### 2. Model Constraints System (`packages/ai/src/types.ts`)

Add constraint metadata to `ModelInfo` to describe what each model supports:

```typescript
/**
 * Constraints that define what a model can and cannot do.
 * Used for capability scoring during model selection.
 */
export interface ModelConstraints {
  image?: {
    /** Supported exact sizes (e.g., ['1024x1024', '1792x1024']) */
    supportedSizes?: string[];

    /** Supported aspect ratios (e.g., ['1:1', '16:9', '9:16']) */
    supportedAspectRatios?: string[];

    /** Maximum dimension for any side */
    maxDimension?: number;

    /** Minimum dimension for any side */
    minDimension?: number;

    /** Whether this model supports image editing */
    supportsEditing?: boolean;

    /** Whether editing supports mask regions */
    supportsMask?: boolean;

    /** Whether negative prompts are supported */
    supportsNegativePrompt?: boolean;

    /** Whether guidance scale parameter is supported */
    supportsGuidanceScale?: boolean;

    /** Range for guidance scale [min, max] */
    guidanceScaleRange?: [number, number];

    /** Whether sampling steps can be configured */
    supportsSteps?: boolean;

    /** Range for steps [min, max] */
    stepsRange?: [number, number];

    /** List of supported sampler algorithms */
    supportedSamplers?: string[];

    /** Supported response formats */
    supportedFormats?: ('url' | 'b64_json')[];
  };

  audio?: {
    // Future: audio constraints
    supportedFormats?: string[];
    maxDuration?: number;
  };

  transcription?: {
    // Future: transcription constraints
    supportedLanguages?: string[];
    supportedFormats?: string[];
  };
}

export interface ModelInfo<TProvider extends string = string> {
  // ... existing fields
  id: string;
  provider: TProvider;
  name: string;
  capabilities: Set<ModelCapability>;
  tier: ModelTier;
  pricing: ModelPricing;
  contextWindow: number;
  maxOutputTokens?: number;
  metrics?: ModelMetrics;
  metadata?: Record<string, unknown>;

  // NEW: Model constraints
  constraints?: ModelConstraints;
}
```

### 3. Provider Capability Scoring (`packages/ai/src/types.ts`)

Add scoring methods to `Provider` interface for evaluating request compatibility:

```typescript
export interface Provider<TConfig = any> {
  // ... existing methods
  name: string;
  config: TConfig;
  priority?: number;
  defaultMetadata?: Partial<AIBaseMetadata<any>>;

  listModels?(config?: TConfig): Promise<ModelInfo[]>;
  checkHealth(config?: TConfig): Promise<boolean>;
  createExecutor?<TContext, TMetadata>(config?: TConfig): Executor<TContext, TMetadata>;
  createStreamer?<TContext, TMetadata>(config?: TConfig): Streamer<TContext, TMetadata>;

  // ... existing capability methods (generateImage, editImage, etc.)

  // === NEW: Request Compatibility Scoring ===
  /**
   * Score how well this provider can handle a specific image generation request.
   *
   * @param request - The image generation request
   * @param model - The model being considered
   * @param config - Provider configuration
   * @returns Score from 0 (cannot handle) to 1.0 (perfect match), or undefined (assume 1.0)
   *
   * @example
   * // Perfect match
   * return 1.0;
   *
   * // Can handle but needs size adjustment
   * return 0.8;
   *
   * // Cannot handle this request
   * return 0;
   */
  scoreImageGenerationRequest?(
    request: ImageGenerationRequest,
    model: ModelInfo,
    config?: TConfig
  ): number;

  /**
   * Score how well this provider can handle an image editing request.
   */
  scoreImageEditRequest?(
    request: ImageEditRequest,
    model: ModelInfo,
    config?: TConfig
  ): number;

  // Future extensions:
  // scoreTranscriptionRequest?(request: TranscriptionRequest, model: ModelInfo, config?: TConfig): number;
  // scoreSpeechRequest?(request: SpeechRequest, model: ModelInfo, config?: TConfig): number;
  // scoreEmbeddingRequest?(request: EmbeddingRequest, model: ModelInfo, config?: TConfig): number;
}
```

### 4. Scoring Implementation in OpenAI Provider (`packages/openai/src/openai.ts`)

Implement scoring logic for OpenAI's specific capabilities and constraints:

```typescript
export class OpenAIProvider<TConfig extends OpenAIConfig = OpenAIConfig> implements Provider<TConfig> {
  // ... existing methods

  /**
   * Score image generation request compatibility.
   *
   * DALL-E 3: Supports 1024x1024, 1024x1792, 1792x1024, HD quality, no negative prompts
   * DALL-E 2: Supports 256x256, 512x512, 1024x1024, supports negative prompts (via hack)
   */
  scoreImageGenerationRequest(
    request: ImageGenerationRequest,
    model: ModelInfo
  ): number {
    let score = 1.0;

    // Check model-specific capabilities
    const isDallE3 = model.id === 'dall-e-3';
    const isDallE2 = model.id === 'dall-e-2';

    if (!isDallE3 && !isDallE2) {
      return 1.0; // Unknown model, assume compatible
    }

    // Size compatibility
    if (request.size) {
      const supportedSizes = isDallE3
        ? ['1024x1024', '1024x1792', '1792x1024']
        : ['256x256', '512x512', '1024x1024'];

      if (!supportedSizes.includes(request.size)) {
        // Find closest size
        const closest = this.findClosestImageSize(request.size, supportedSizes);
        if (closest.score > 0.7) {
          score *= 0.85; // Can handle with minor adjustment
        } else {
          score *= 0.6; // Significant size mismatch
        }
      }
    }

    // Width/height compatibility
    if (request.width && request.height) {
      const requestedSize = `${request.width}x${request.height}`;
      const supportedSizes = isDallE3
        ? ['1024x1024', '1024x1792', '1792x1024']
        : ['256x256', '512x512', '1024x1024'];

      if (!supportedSizes.includes(requestedSize)) {
        score *= 0.8;
      }
    }

    // Negative prompt support
    if (request.negativePrompt) {
      if (isDallE3) {
        return 0; // DALL-E 3 cannot handle negative prompts
      }
      // DALL-E 2 can use workarounds
      score *= 0.7;
    }

    // Advanced parameters (Stable Diffusion specific)
    if (request.guidanceScale || request.steps || request.sampler) {
      return 0; // DALL-E doesn't support these parameters
    }

    // Quality support
    if (request.quality === 'hd' && !isDallE3) {
      score *= 0.5; // DALL-E 2 doesn't support HD
    }

    // Style support
    if (request.style && !isDallE3) {
      score *= 0.5; // DALL-E 2 doesn't support style
    }

    return score;
  }

  /**
   * Score image editing request compatibility.
   *
   * DALL-E 3: Does NOT support editing
   * DALL-E 2: Supports editing with 256x256, 512x512, 1024x1024
   */
  scoreImageEditRequest(
    request: ImageEditRequest,
    model: ModelInfo
  ): number {
    const isDallE3 = model.id === 'dall-e-3';
    const isDallE2 = model.id === 'dall-e-2';

    // DALL-E 3 cannot edit images
    if (isDallE3) {
      return 0;
    }

    // DALL-E 2 supports editing
    if (isDallE2) {
      let score = 1.0;

      // Size compatibility
      const supportedSizes = ['256x256', '512x512', '1024x1024'];
      if (request.size && !supportedSizes.includes(request.size)) {
        const closest = this.findClosestImageSize(request.size, supportedSizes);
        score *= closest.score;
      }

      // Mask support (always supported)
      // Negative prompt (limited support)
      if (request.negativePrompt) {
        score *= 0.7;
      }

      // Advanced parameters
      if (request.guidanceScale || request.steps || request.sampler) {
        return 0;
      }

      return score;
    }

    // Unknown model, assume no support
    return 0;
  }

  /**
   * Find the closest supported size to the requested size.
   */
  private findClosestImageSize(
    requested: string,
    supported: string[]
  ): { size: string; score: number } {
    const reqParsed = this.parseImageSize(requested);
    if (!reqParsed) {
      return { size: supported[0], score: 0.5 };
    }

    let best = { size: supported[0], score: 0 };

    for (const size of supported) {
      const supParsed = this.parseImageSize(size);
      if (!supParsed) continue;

      // Calculate similarity based on area and aspect ratio
      const reqArea = reqParsed.width * reqParsed.height;
      const supArea = supParsed.width * supParsed.height;
      const areaDiff = Math.abs(reqArea - supArea) / Math.max(reqArea, supArea);

      const reqAspect = reqParsed.width / reqParsed.height;
      const supAspect = supParsed.width / supParsed.height;
      const aspectDiff = Math.abs(reqAspect - supAspect) / Math.max(reqAspect, supAspect);

      // Score: 1.0 = perfect match, 0 = very different
      const score = 1.0 - (areaDiff * 0.5 + aspectDiff * 0.5);

      if (score > best.score) {
        best = { size, score };
      }
    }

    return best;
  }

  /**
   * Parse image size string (e.g., "1024x768") to dimensions.
   */
  private parseImageSize(size: string): { width: number; height: number } | null {
    const match = size.match(/^(\d+)x(\d+)$/);
    if (!match) return null;
    return { width: parseInt(match[1]), height: parseInt(match[2]) };
  }
}
```

### 5. Enhanced Model Selection (`packages/ai/src/registry.ts`)

Modify `scoreModel()` to include provider request compatibility scoring:

```typescript
export class ModelRegistry<TProviders extends Providers> {
  // ... existing fields

  /**
   * Score a model against criteria, including request compatibility.
   */
  private scoreModel(
    model: ModelInfo,
    criteria: AIBaseMetadata<TProviders>
  ): ScoredModel {
    const result: ScoredModel = {
      model,
      score: 0,
      matchedRequired: [],
      matchedOptional: [],
      missingRequired: [],
    };

    // Check provider allowlist/blocklist
    if (criteria.providers) {
      if (criteria.providers.deny?.includes(model.provider)) {
        return result; // score = 0
      }
      if (criteria.providers.allow && !criteria.providers.allow.includes(model.provider)) {
        return result; // score = 0
      }
    }

    // Check required capabilities against both model AND provider
    if (criteria.required) {
      const providerCaps = this.providerCapabilities.get(model.provider);

      for (const cap of criteria.required) {
        const modelHasCap = model.capabilities.has(cap);
        const providerSupportsCap = !providerCaps || providerCaps.has(cap);

        if (modelHasCap && providerSupportsCap) {
          result.matchedRequired.push(cap);
        } else {
          result.missingRequired.push(cap);
        }
      }

      // If any required capabilities are missing, score = 0
      if (result.missingRequired.length > 0) {
        return result;
      }
    }

    // Check optional capabilities
    if (criteria.optional) {
      for (const cap of criteria.optional) {
        if (model.capabilities.has(cap)) {
          result.matchedOptional.push(cap);
        }
      }
    }

    // Check minimum context window
    if (criteria.minContextWindow && model.contextWindow < criteria.minContextWindow) {
      return result; // score = 0
    }

    // === NEW: Provider Request Compatibility Scoring ===
    let compatibilityScore = 1.0;

    const provider = this.providers.get(model.provider);
    if (provider && criteria.request) {
      // Determine request type and call appropriate scoring method
      const request = criteria.request;

      if (this.isImageGenerationRequest(request)) {
        compatibilityScore = provider.scoreImageGenerationRequest?.(
          request,
          model,
          provider.config
        ) ?? 1.0;
      } else if (this.isImageEditRequest(request)) {
        compatibilityScore = provider.scoreImageEditRequest?.(
          request,
          model,
          provider.config
        ) ?? 1.0;
      }
      // Future: Add other request types (transcription, speech, etc.)
    }

    // If compatibility is 0, provider cannot handle this request
    if (compatibilityScore === 0) {
      return result; // score = 0
    }

    // Calculate base score using existing weighting logic
    const weights = criteria.weights || { cost: 0.5, speed: 0.3, accuracy: 0.2 };
    const baseScore = this.calculateWeightedScore(model, weights, criteria);

    // Final score = base score × compatibility score
    result.score = baseScore * compatibilityScore;

    return result;
  }

  // === NEW: Request Type Guards ===
  private isImageGenerationRequest(request: any): request is ImageGenerationRequest {
    return request && typeof request.prompt === 'string' && !request.image;
  }

  private isImageEditRequest(request: any): request is ImageEditRequest {
    return request && typeof request.prompt === 'string' && request.image !== undefined;
  }
}
```

### 6. Request Metadata Enhancement (`packages/ai/src/types.ts`)

Allow passing request to metadata for scoring:

```typescript
export interface AIBaseMetadata<TProviders extends Providers> {
  // Specific model to use (bypasses selection)
  model?: string;

  // Required capabilities (model must have all)
  required?: ModelCapability[];

  // Optional capabilities (preferred but not required)
  optional?: ModelCapability[];

  // Provider allowlist/denylist
  providers?: {
    allow?: (keyof TProviders)[];
    deny?: (keyof TProviders)[];
  };

  // Cost constraints
  budget?: {
    maxCostPerRequest?: number;
    maxCostPerMillionTokens?: number;
  };

  // Scoring weights for model selection
  weights?: ModelSelectionWeights;

  // Minimum context window size required
  minContextWindow?: number;

  // === NEW: Request for Provider Compatibility Scoring ===
  /**
   * The actual request being made, used for provider compatibility scoring.
   * Providers can examine the request details to determine if they can handle it.
   */
  request?:
    | ImageGenerationRequest
    | ImageEditRequest
    | TranscriptionRequest
    | SpeechRequest
    | EmbeddingRequest;
}
```

### 7. Explicit Model Selection Logic (`packages/ai/src/registry.ts`)

When explicit model specified, evaluate ALL providers that have it:

```typescript
export class ModelRegistry<TProviders extends Providers> {
  /**
   * Select best model based on criteria.
   *
   * NEW: When model is explicitly specified, evaluates all providers
   * that support that model and selects the best one based on compatibility.
   */
  selectModel(criteria: AIBaseMetadata<TProviders>): SelectedModel<TProviders, keyof TProviders> | undefined {
    if (criteria.model) {
      const modelId = criteria.model;
      const candidates: Array<{
        model: ModelInfo;
        provider: TProviders[keyof TProviders];
        score: number;
      }> = [];

      // NEW: Check ALL providers for this model
      for (const [providerName, provider] of this.providers.entries()) {
        const key = modelId.includes('/') ? modelId : `${providerName as string}/${modelId}`;
        const model = this.models.get(key);

        if (!model) continue;

        // Validate provider supports required capabilities
        if (criteria.required) {
          const providerCaps = this.providerCapabilities.get(model.provider);
          let hasAll = true;

          for (const cap of criteria.required) {
            const providerSupportsCap = !providerCaps || providerCaps.has(cap);
            if (!providerSupportsCap) {
              hasAll = false;
              break;
            }
          }

          if (!hasAll) {
            continue; // Skip this provider
          }
        }

        // Score provider compatibility with request
        let compatibilityScore = 1.0;

        if (criteria.request) {
          if (this.isImageGenerationRequest(criteria.request)) {
            compatibilityScore = provider.scoreImageGenerationRequest?.(
              criteria.request,
              model,
              provider.config
            ) ?? 1.0;
          } else if (this.isImageEditRequest(criteria.request)) {
            compatibilityScore = provider.scoreImageEditRequest?.(
              criteria.request,
              model,
              provider.config
            ) ?? 1.0;
          }
        }

        // Only consider providers that can handle the request
        if (compatibilityScore > 0) {
          candidates.push({
            model,
            provider,
            score: compatibilityScore,
          });
        }
      }

      // Return provider with highest compatibility score
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];

        return {
          model: best.model,
          provider: best.provider,
          score: best.score,
        } as SelectedModel<TProviders, keyof TProviders>;
      }

      return undefined; // No provider can handle this model/request combo
    }

    // No explicit model - search and score all compatible models
    const scored = this.searchModels(criteria);
    if (scored.length === 0) {
      return undefined;
    }

    const best = scored[0];
    const provider = this.providers.get(best.model.provider);
    if (!provider) {
      return undefined;
    }

    return {
      model: best.model,
      provider,
      score: best.score,
    } as SelectedModel<TProviders, keyof TProviders>;
  }
}
```

### 8. Helper Utilities (`packages/ai/src/utils/sizing.ts`)

Create utilities for dimension matching and conversion:

```typescript
/**
 * Utilities for image sizing, aspect ratios, and dimension matching.
 */

/**
 * Parse size string (e.g., "1024x768") into width and height.
 */
export function parseSize(size: string): { width: number; height: number } | null {
  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  return {
    width: parseInt(match[1], 10),
    height: parseInt(match[2], 10),
  };
}

/**
 * Calculate aspect ratio from width and height.
 * Returns simplified ratio (e.g., "16:9" instead of "1920:1080").
 */
export function calculateAspectRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

/**
 * Parse aspect ratio string (e.g., "16:9") into numeric ratio.
 */
export function parseAspectRatio(ratio: string): number | null {
  const match = ratio.match(/^(\d+):(\d+)$/);
  if (!match) return null;
  const width = parseInt(match[1], 10);
  const height = parseInt(match[2], 10);
  return width / height;
}

/**
 * Find the closest supported size to the requested size.
 * Scores based on both area similarity and aspect ratio match.
 */
export function findClosestSize(
  requested: string,
  supported: string[]
): { size: string; score: number } {
  const req = parseSize(requested);
  if (!req) {
    return { size: supported[0], score: 0.5 };
  }

  let best = { size: supported[0], score: 0 };

  for (const size of supported) {
    const sup = parseSize(size);
    if (!sup) continue;

    // Calculate area difference (normalized 0-1)
    const reqArea = req.width * req.height;
    const supArea = sup.width * sup.height;
    const areaDiff = Math.abs(reqArea - supArea) / Math.max(reqArea, supArea);

    // Calculate aspect ratio difference (normalized 0-1)
    const reqAspect = req.width / req.height;
    const supAspect = sup.width / sup.height;
    const aspectDiff = Math.abs(reqAspect - supAspect) / Math.max(reqAspect, supAspect);

    // Score: 1.0 = perfect match, 0 = completely different
    // Weight aspect ratio more heavily (60%) than area (40%)
    const score = 1.0 - (areaDiff * 0.4 + aspectDiff * 0.6);

    if (score > best.score) {
      best = { size, score };
    }
  }

  return best;
}

/**
 * Convert aspect ratio to size given a target area or dimension.
 */
export function aspectRatioToSize(
  aspectRatio: string,
  targetArea?: number,
  targetWidth?: number,
  targetHeight?: number
): { width: number; height: number } | null {
  const ratio = parseAspectRatio(aspectRatio);
  if (ratio === null) return null;

  if (targetArea) {
    // Calculate dimensions from target area
    const height = Math.sqrt(targetArea / ratio);
    const width = height * ratio;
    return {
      width: Math.round(width),
      height: Math.round(height),
    };
  } else if (targetWidth) {
    return {
      width: targetWidth,
      height: Math.round(targetWidth / ratio),
    };
  } else if (targetHeight) {
    return {
      width: Math.round(targetHeight * ratio),
      height: targetHeight,
    };
  }

  return null;
}

/**
 * Standard aspect ratios and their common use cases.
 */
export const STANDARD_ASPECT_RATIOS = {
  '1:1': { name: 'Square', uses: ['Social media', 'Profile pictures', 'Instagram'] },
  '16:9': { name: 'Landscape', uses: ['Desktop wallpapers', 'YouTube', 'TV'] },
  '9:16': { name: 'Portrait', uses: ['Mobile screens', 'Instagram Stories', 'TikTok'] },
  '4:3': { name: 'Classic', uses: ['Standard monitors', 'Classic TV'] },
  '3:2': { name: 'Photo', uses: ['35mm film', 'Prints', 'Photography'] },
  '4:5': { name: 'Portrait Photo', uses: ['Instagram portrait', '8x10 prints'] },
  '21:9': { name: 'Ultrawide', uses: ['Cinema', 'Ultrawide monitors'] },
} as const;

/**
 * Common image sizes for various platforms and use cases.
 */
export const COMMON_SIZES = {
  // Square
  square_512: '512x512',
  square_1024: '1024x1024',
  square_2048: '2048x2048',

  // Landscape 16:9
  landscape_hd: '1280x720',
  landscape_fhd: '1920x1080',
  landscape_4k: '3840x2160',

  // Portrait 9:16
  portrait_hd: '720x1280',
  portrait_fhd: '1080x1920',

  // DALL-E specific
  dalle2_small: '256x256',
  dalle2_medium: '512x512',
  dalle2_large: '1024x1024',
  dalle3_square: '1024x1024',
  dalle3_landscape: '1792x1024',
  dalle3_portrait: '1024x1792',
} as const;
```

---

## Migration Path

### Phase 1: Add New Parameter Fields (Week 1)
- Add new optional fields to `ImageGenerationRequest` and `ImageEditRequest`
- Backward compatible - all existing code continues to work
- Document new parameters in type definitions

### Phase 2: Add Scoring Infrastructure (Week 1-2)
- Add optional scoring methods to `Provider` interface
- Add `ModelConstraints` type and field to `ModelInfo`
- Add `request` field to `AIBaseMetadata`
- Create sizing utilities

### Phase 3: Implement OpenAI Scoring (Week 2)
- Implement `scoreImageGenerationRequest` in OpenAI provider
- Implement `scoreImageEditRequest` in OpenAI provider
- Add constraint metadata to DALL-E models
- Reference implementation for other providers

### Phase 4: Enhance Model Selection (Week 2-3)
- Modify `ModelRegistry.scoreModel()` to use provider scoring
- Modify `ModelRegistry.selectModel()` for multi-provider evaluation
- Add request type guards
- Test with various request scenarios

### Phase 5: Add Constraints to Models (Week 3-4)
- Populate constraint metadata for OpenAI models
- Add constraints to other provider models as discovered
- Update model sources to include constraint data
- Document constraints in model metadata

### Phase 6: Additional Providers (Ongoing)
- Implement scoring for Replicate provider
- Implement scoring for other providers
- Community contributions for provider-specific scoring

---

## Benefits

✅ **Graceful Degradation**: Providers can score 0.7-0.9 for "close enough" matches instead of hard failure

✅ **Provider Competition**: When a model is explicitly specified, all providers offering that model compete based on compatibility

✅ **Parameter Flexibility**: Universal parameters work across providers, with provider-specific handling

✅ **Backward Compatible**: All new fields are optional; existing code continues to work unchanged

✅ **Extensible Pattern**: Same scoring pattern applies to audio, transcription, speech, embeddings, etc.

✅ **Smart Fallbacks**: System automatically finds best alternative when exact match isn't available

✅ **Fine-Grained Control**: Users can specify exact parameters; system finds compatible provider/model combo

✅ **Provider-Agnostic**: Application code doesn't need to know provider-specific limitations

✅ **Future-Proof**: New providers can implement scoring without changing core library

---

## Example Usage

### Example 1: Auto-Selection with Constraints

```typescript
// Request specific size and quality
const result = await ai.image.generate.get({
  prompt: "A serene mountain landscape at sunset",
  size: "1792x1024",
  quality: "hd",
  negativePrompt: "people, buildings, cars"
});

// System will:
// 1. Filter to providers with 'image' capability
// 2. Score each model's compatibility with request
// 3. DALL-E 3 scores 1.0 (perfect match for size, quality)
// 4. DALL-E 2 scores 0 (cannot do HD or that size)
// 5. Stable Diffusion scores 0.8 (can do size, has negative prompt)
// 6. Select best match (DALL-E 3 if available, SD otherwise)
```

### Example 2: Explicit Model, Best Provider

```typescript
// User wants DALL-E 2 specifically
const result = await ai.image.generate.get({
  prompt: "A cute cat wearing sunglasses",
  size: "1024x1024",
}, {
  metadata: { model: "dall-e-2" }
});

// System will:
// 1. Find all providers offering "dall-e-2"
// 2. Score each provider's compatibility (OpenAI: 1.0, others may vary)
// 3. Select provider with highest score
// 4. Use that provider's implementation
```

### Example 3: Advanced Parameters

```typescript
// Request with Stable Diffusion parameters
const result = await ai.image.generate.get({
  prompt: "Cyberpunk city at night, neon lights",
  negativePrompt: "blurry, low quality, distorted",
  width: 1024,
  height: 768,
  guidanceScale: 7.5,
  steps: 30,
  sampler: "euler_a"
});

// System will:
// 1. Score providers for compatibility
// 2. DALL-E scores 0 (doesn't support guidance scale)
// 3. Stable Diffusion scores 1.0 (perfect match)
// 4. Select Stable Diffusion provider automatically
```

### Example 4: Graceful Size Adaptation

```typescript
// Request unusual size
const result = await ai.image.generate.get({
  prompt: "Abstract geometric art",
  size: "1500x1500",
});

// System will:
// 1. DALL-E 3 scores 0.85 (can do 1024x1024 or 1792x1792, close enough)
// 2. Stable Diffusion scores 0.95 (can generate arbitrary sizes)
// 3. Select best match with acceptable degradation
// 4. Generate image at closest supported size
```

---

## Testing Strategy

### Unit Tests
- Test scoring functions with various request combinations
- Test size matching algorithms
- Test aspect ratio calculations
- Test type guards for request identification

### Integration Tests
- Test model selection with different request parameters
- Test fallback behavior when perfect match unavailable
- Test multi-provider scenarios with same model
- Test backward compatibility with existing code

### Provider Tests
- Test each provider's scoring implementation
- Verify constraint metadata accuracy
- Test edge cases (unsupported sizes, parameters)

### End-to-End Tests
- Test complete workflow from request to response
- Test streaming variants
- Test error handling for incompatible requests
- Performance testing with large model sets

---

## Documentation Updates

- Add parameter documentation to `ImageGenerationRequest`
- Document scoring methodology for provider implementers
- Add examples for common use cases
- Update migration guide for existing users
- Document constraint metadata format
- Add provider implementation guide

---

## Future Extensions

### Additional Request Types
- Apply same scoring pattern to transcription requests
- Add scoring for speech synthesis requests
- Add scoring for embedding requests

### Advanced Constraints
- Resolution constraints (minimum megapixels)
- Prompt length constraints
- Generation time constraints
- Cost per request constraints

### Model Discovery
- Auto-populate constraints from model metadata
- Fetch constraints from external model registries
- Community-contributed constraint data

### Performance Optimizations
- Cache scoring results for common requests
- Parallel scoring of multiple providers
- Predictive model selection based on usage patterns
