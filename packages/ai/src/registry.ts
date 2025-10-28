/**
 * Model Registry
 *
 * Centralized model management with provider ordering and adapter registration.
 * Provider order ensures deterministic model resolution: first provider to return a model ID wins.
 */

import { detectTier } from './modelDetection';
import type {
  AIBaseMetadata,
  ModelCapability,
  ModelParameter,
  ModelHandler,
  ModelInfo,
  ModelOverride,
  ModelSelectionWeights,
  ModelSource,
  Provider,
  Providers,
  ScoredModel,
  SelectedModel,
} from './types';

// ============================================================================
// Provider Capability Detection
// ============================================================================

/**
 * Determines which capabilities a provider supports based on its defined methods.
 * Treats streaming and non-streaming methods as equivalent for capability detection.
 *
 * This is useful for:
 * - Filtering providers during model selection
 * - Validating provider compatibility before requests
 * - Displaying provider capabilities in UI
 *
 * @param provider - The provider to inspect
 * @returns Set of capabilities the provider supports
 *
 * @example Basic usage
 * ```typescript
 * import { OpenAIProvider } from '@aits/openai';
 * import { getProviderCapabilities } from '@aits/ai';
 *
 * const openai = new OpenAIProvider({ apiKey: '...' });
 * const caps = getProviderCapabilities(openai);
 * console.log(caps);
 * // Set(['chat', 'streaming', 'image', 'audio', 'hearing', 'embedding'])
 * ```
 *
 * @example Checking specific capability
 * ```typescript
 * const openrouter = new OpenRouterProvider({ apiKey: '...' });
 * const caps = getProviderCapabilities(openrouter);
 *
 * if (caps.has('image')) {
 *   console.log('Provider supports image generation');
 * } else {
 *   console.log('Provider does not support image generation');
 * }
 * // Output: "Provider does not support image generation"
 * ```
 *
 * @example Filtering providers by capability
 * ```typescript
 * const providers = { openai, openrouter, anthropic };
 * const imageProviders = Object.entries(providers)
 *   .filter(([name, provider]) => getProviderCapabilities(provider).has('image'))
 *   .map(([name]) => name);
 * console.log(imageProviders); // ['openai']
 * ```
 */
export function getProviderCapabilities(provider: Provider): Set<ModelCapability> {
  const capabilities = new Set<ModelCapability>();

  // chat - Basic text completion
  if (provider.createExecutor !== undefined) {
    capabilities.add('chat');
  }

  // streaming - Real-time response streaming
  if (provider.createStreamer !== undefined) {
    capabilities.add('streaming');
  }

  // image - Image generation (DALL-E, Stable Diffusion, etc.)
  // Either method counts as supporting the capability
  if (provider.generateImage !== undefined || provider.generateImageStream !== undefined) {
    capabilities.add('image');
  }

  // vision - Image understanding/analysis
  // Note: vision is a model capability, not a provider method
  // Vision is handled through chat messages with image content
  // It cannot be detected from provider methods alone

  // audio - Text-to-speech synthesis
  if (provider.speech !== undefined) {
    capabilities.add('audio');
  }

  // hearing - Speech-to-text transcription
  if (provider.transcribe !== undefined || provider.transcribeStream !== undefined) {
    capabilities.add('hearing');
  }

  // embedding - Text embeddings for semantic search
  if (provider.embed !== undefined) {
    capabilities.add('embedding');
  }

  // tools - Function/tool calling
  // Note: This is typically a model capability, not detected from provider methods
  // Function calling is handled through createExecutor with tools parameter

  // json - JSON output mode
  // Note: This is a model capability, not a provider method

  // structured - Structured output with schemas
  // Note: This is a model capability, not a provider method

  // reasoning - Extended reasoning (like OpenAI o1)
  // Note: This is a model capability, not a provider method

  // zdr - Zero data retention
  // Note: This is a privacy/compliance feature, not detected from provider methods

  return capabilities;
}

// ============================================================================
// Model Registry
// ============================================================================

export class ModelRegistry<TProviders extends Providers> {

  private models: Map<string, ModelInfo> = new Map(); // key: "provider/model"
  private modelHandlers: Map<string, ModelHandler> = new Map();
  private providers: Map<keyof TProviders & string, TProviders[keyof TProviders]> = new Map();
  private providerCapabilities: Map<keyof TProviders & string, Set<ModelCapability>> = new Map();
  private modelSources: ModelSource[] = [];
  private modelOverrides: ModelOverride[];
  private defaultCostPerMillionTokens: number;

  constructor(
    providers: TProviders,
    modelOverrides: ModelOverride[] = [],
    defaultCostPerMillionTokens: number = 5.0,
    modelSources: ModelSource[] = []
  ) {
    // Store providers
    this.providers = new Map(Object.entries(providers)) as Map<keyof TProviders & string, TProviders[keyof TProviders]>;

    // Pre-compute provider capabilities for efficient lookup during selection
    for (const [providerName, provider] of this.providers.entries()) {
      const capabilities = getProviderCapabilities(provider);
      this.providerCapabilities.set(providerName, capabilities);
    }

    // Set provider order (determines which provider "wins" for duplicate model IDs)
    this.modelOverrides = modelOverrides;
    this.defaultCostPerMillionTokens = defaultCostPerMillionTokens;
    this.modelSources = modelSources;
  }

  /**
   * Add model sources to the registry
   */
  addModelSources(sources: ModelSource[]): void {
    this.modelSources.push(...sources);
  }

  /**
   * Register a model in the registry
   * Provider order matters: first to register wins
   */
  registerModel(model: ModelInfo): void {
    const key = `${model.provider}/${model.id}`;

    // If model already exists, only override if new provider has higher priority
    if (this.models.has(key)) {
      const existing = this.models.get(key)!;
      const existingPriority = existing.provider || 0;
      const newPriority = model.provider || 0;

      // Lower index = higher priority
      if (newPriority < existingPriority) {
        this.models.set(key, this.applyOverrides(model));
      }
    } else {
      this.models.set(key, this.applyOverrides(model));
    }
  }

  /**
   * Register multiple models
   */
  registerModels(models: ModelInfo[]): void {
    for (const model of models) {
      this.registerModel(model);
    }
  }

  /**
   * Get a model by ID (checks all providers in order)
   */
  getModel(id: string): ModelInfo | undefined {
    // Try with provider prefix first
    if (id.includes('/')) {
      return this.models.get(id);
    }

    let priorityProvider = 10;
    let priorityModel: ModelInfo | undefined = undefined;

    // Try each provider in order
    for (const [providerName, provider] of this.providers.entries()) {
      const key = `${providerName as string}/${id}`;
      const priority = provider.priority ?? 10;
      const model = this.models.get(key);
      if (model && (!priorityModel || priority < priorityProvider)) {
        priorityModel = model;
        priorityProvider = priority;
      }
    }

    return priorityModel;
  }

  /**
   * List all models
   */
  listModels(): ModelInfo[] {
    return Array.from(this.models.values());
  }

  /**
   * Search and score models based on criteria
   */
  searchModels(metadata: AIBaseMetadata<TProviders>): ScoredModel[] {
    const allModels = this.listModels();
    const scored: ScoredModel[] = [];

    for (const model of allModels) {
      const score = this.scoreModel(model, metadata);
      if (score.score > 0) {
        scored.push(score);
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored;
  }

  /**
   * Select best model based on criteria
   */
  selectModel(criteria: AIBaseMetadata<TProviders>): SelectedModel<TProviders, keyof TProviders> | undefined {
    // If model explicitly specified, use it
    if (criteria.model) {
      const model = this.getModel(criteria.model);
      if (!model) {
        return undefined;
      }

      const provider = this.providers.get(model.provider);
      if (!provider) {
        return undefined;
      }

      // Validate that provider supports required capabilities
      if (criteria.required) {
        const providerCaps = this.providerCapabilities.get(model.provider);

        for (const cap of criteria.required) {
          // Check if provider supports this capability
          const providerSupportsCap = !providerCaps || providerCaps.has(cap);

          if (!providerSupportsCap) {
            // Provider doesn't support this capability, cannot use this model
            return undefined;
          }
        }
      }

      // Validate that model supports required parameters
      if (criteria.requiredParameters && criteria.requiredParameters.length > 0) {
        const optionalParams = criteria.optionalParameters || [];

        for (const param of criteria.requiredParameters) {
          // If this param is marked as optional, skip the requirement check
          if (optionalParams.includes(param)) {
            continue;
          }

          // Check if model supports this parameter
          const modelSupportsParam = model.supportedParameters?.has(param) ?? false;

          if (!modelSupportsParam) {
            // Required parameter not supported by model
            return undefined;
          }
        }
      }

      return {
        model,
        provider,
        providerConfig: provider.config,
        score: 1.0,
      } as SelectedModel<TProviders, keyof TProviders>;
    }

    // Search and score all compatible models
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
      providerConfig: provider.config,
      score: best.score,
    } as SelectedModel<TProviders, keyof TProviders>;
  }

  /**
   * Register a model handler
   */
  registerHandler(handler: ModelHandler<any>): void {
    const key = `${handler.provider}/${handler.modelId}`;
    this.modelHandlers.set(key, handler);
  }

  /**
   * Get handler for a model
   */
  getHandler(provider: string, modelId: string): ModelHandler | undefined {
    const key = `${provider}/${modelId}`;
    return this.modelHandlers.get(key);
  }

  /**
   * Get provider info
   */
  getProvider(name: keyof TProviders & string): TProviders[keyof TProviders] | undefined {
    return this.providers.get(name);
  }

  /**
   * Get pre-computed capabilities for a provider
   * @param name - Provider name
   * @returns Set of capabilities the provider supports, or undefined if provider not found
   */
  getProviderCapabilities(name: keyof TProviders & string): Set<ModelCapability> | undefined {
    return this.providerCapabilities.get(name);
  }

  /**
   * Score a model against criteria
   */
  private scoreModel(model: ModelInfo, criteria: AIBaseMetadata<TProviders>): ScoredModel {
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
        // Check if model has the capability
        const modelHasCap = model.capabilities.has(cap);

        // Check if provider supports the capability
        // If provider capabilities are not cached, assume it's supported (backward compatibility)
        const providerSupportsCap = !providerCaps || providerCaps.has(cap);

        // Both model AND provider must support the capability
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

    // Check required parameters
    if (criteria.requiredParameters && criteria.requiredParameters.length > 0) {
      const optionalParams = criteria.optionalParameters || [];

      for (const param of criteria.requiredParameters) {
        // If this param is marked as optional, skip the requirement check
        if (optionalParams.includes(param)) {
          continue;
        }

        // Check if model supports this parameter
        const modelSupportsParam = model.supportedParameters?.has(param) ?? false;

        if (!modelSupportsParam) {
          // Required parameter not supported by model
          return result; // score = 0
        }
      }
    }

    // Check minimum context window
    if (criteria.minContextWindow && model.contextWindow < criteria.minContextWindow) {
      return result; // score = 0
    }

    if (criteria.tier && model.tier !== criteria.tier) {
      return result; // score = 0
    }

    // Calculate score based on weights
    const weights = criteria.weights || { cost: 0.5, speed: 0.3, accuracy: 0.2 };
    result.score = this.calculateWeightedScore(model, weights, criteria);

    return result;
  }

  /**
   * Calculate weighted score for a model
   */
  private calculateWeightedScore(
    model: ModelInfo,
    weights: ModelSelectionWeights,
    metadata: AIBaseMetadata<TProviders>
  ): number {
    let score = 0;

    // Cost score (lower is better, invert)
    if (weights.cost) {
      // TODO more sophisticated cost modeling
      const avgCost = ((model.pricing.text?.input ?? 0) + (model.pricing.text?.output ?? 0)) / 2;
      const costScore = 1 / (1 + avgCost / 10); // Normalize
      score += weights.cost * costScore;
    }

    // Speed score
    if (weights.speed && model.metrics?.tokensPerSecond) {
      const speedScore = Math.min(model.metrics.tokensPerSecond / 100, 1); // Normalize to 0-1
      score += weights.speed * speedScore;
    }

    // Accuracy score - use metrics if available, otherwise tier-based
    if (weights.accuracy) {
      if (model.metrics?.accuracyScore) {
        score += weights.accuracy * model.metrics.accuracyScore;
      } else if (model.tier) {
        // Fallback to tier-based accuracy when metrics not available
        const tierScore = model.tier === 'flagship' ? 1.0 : model.tier === 'efficient' ? 0.7 : 0.5;
        score += weights.accuracy * tierScore;
      }
    }

    // Context window score
    if (weights.contextWindow) {
      const contextScore = Math.min(model.contextWindow / 100000, 1); // Normalize
      score += weights.contextWindow * contextScore;
    }

    // Optional capabilities multiplier - models matching more optional caps get a score multiplier
    // This ensures optional capabilities are strongly preferred
    if (metadata.optional && metadata.optional.length > 0) {
      const optionalMatches = metadata.optional.filter(cap => model.capabilities.has(cap)).length;
      const matchRatio = optionalMatches / metadata.optional.length;
      // Apply 1.0x to 2.0x multiplier based on optional capability match rate
      // This allows optional caps to overcome significant cost differences
      const multiplier = 1.0 + matchRatio;
      score *= multiplier;
    }

    // Optional parameters bonus - models supporting optional parameters get a score boost
    if (metadata.optionalParameters && metadata.optionalParameters.length > 0) {
      let supportedOptionalParams = 0;
      for (const param of metadata.optionalParameters) {
        if (model.supportedParameters?.has(param)) {
          supportedOptionalParams++;
        }
      }
      const matchRatio = supportedOptionalParams / metadata.optionalParameters.length;
      // Apply 1.0x to 1.5x multiplier based on optional parameter match rate
      const multiplier = 1.0 + (matchRatio * 0.5);
      score *= multiplier;
    }

    return score;
  }

  /**
   * Apply overrides to a model
   */
  private applyOverrides(model: ModelInfo): ModelInfo {
    let result = { ...model };

    for (const override of this.modelOverrides) {
      // Check if override matches
      if (override.provider && override.provider !== model.provider) {
        continue;
      }
      if (override.modelId && override.modelId !== model.id) {
        continue;
      }
      if (override.modelPattern && !override.modelPattern.test(model.id)) {
        continue;
      }

      // Apply overrides
      result = {
        ...result,
        ...override.overrides,
        // Merge nested objects
        pricing: { ...result.pricing, ...override.overrides.pricing },
        metrics: { ...result.metrics, ...override.overrides.metrics },
        metadata: { ...result.metadata, ...override.overrides.metadata },
      };
    }

    return result;
  }

  /**
   * Merge two ModelInfo objects intelligently
   * Prefers non-default values and combines capabilities
   */
  private mergeModelInfo(base: ModelInfo, source: ModelInfo): ModelInfo {
    // Merge capabilities
    const mergedCapabilities = new Set([...base.capabilities, ...source.capabilities]);

    // Merge pricing (prefer source if it has non-zero values)
    const mergedPricing = { ...base.pricing, ...source.pricing };

    // Merge metrics (prefer source if available)
    const mergedMetrics = source.metrics ?? base.metrics;

    // Merge metadata (combine, source takes priority for conflicts)
    const mergedMetadata = {
      ...base.metadata,
      ...source.metadata,
    };

    return {
      id: base.id,
      provider: base.provider,
      name: source.name || base.name,
      capabilities: mergedCapabilities,
      tier: source.tier !== 'experimental' ? source.tier : base.tier,
      pricing: mergedPricing,
      contextWindow: source.contextWindow > 0 ? source.contextWindow : base.contextWindow,
      maxOutputTokens: source.maxOutputTokens ?? base.maxOutputTokens,
      metrics: mergedMetrics,
      metadata: mergedMetadata,
    };
  }

  /**
   * Refresh models from all providers and model sources
   */
  async refresh(): Promise<void> {
    this.models.clear();

    // Step 1: Fetch from model sources (e.g., OpenRouter)
    const sourceModels = new Map<string, ModelInfo>();
    for (const source of this.modelSources) {
      try {
        const models = await source.fetchModels();
        for (const model of models) {
          const key = `${model.provider}/${model.id}`;
          sourceModels.set(key, model);
        }
      } catch (error) {
        console.error(`Failed to fetch models from source ${source.name}:`, error);
      }
    }

    const providers = Array.from(this.providers.entries());
    providers.sort((a, b) => {
      const priorityA = a[1].priority ?? 10;
      const priorityB = b[1].priority ?? 10;
      return priorityA - priorityB;
    });

    // Step 2: Fetch from each provider and merge with source models
    for (const [providerName, provider] of providers) {
      
      try {
        // Skip if provider doesn't implement listModels
        if (!provider.listModels) {
          continue;
        }

        const modelInfos = await provider.listModels();

        // For each model from provider
        for (const modelInfo of modelInfos) {
          // Create key for looking up source info
          const key = `${providerName as string}/${modelInfo.id}`;

          // Create base model with defaults
          let fullModel: ModelInfo<keyof TProviders & string> = {
            id: modelInfo.id,
            provider: providerName,
            name: modelInfo.name || modelInfo.id,
            capabilities: modelInfo.capabilities || new Set(['chat', 'streaming'] as ModelCapability[]),
            tier: modelInfo.tier || detectTier(modelInfo.name || modelInfo.id),
            pricing: modelInfo.pricing || {
              inputTokensPer1M: this.defaultCostPerMillionTokens,
              outputTokensPer1M: this.defaultCostPerMillionTokens * 2,
            },
            contextWindow: modelInfo.contextWindow || 8192,
            maxOutputTokens: modelInfo.maxOutputTokens,
            metrics: modelInfo.metrics,
            metadata: modelInfo.metadata || {},
          };

          // Merge with source model info if available
          const sourceModel = sourceModels.get(key);
          if (sourceModel) {
            fullModel = this.mergeModelInfo(fullModel, sourceModel);
          }

          this.registerModel(fullModel);
        }
      } catch (error) {
        // Continue with other providers if one fails
        console.error(`Failed to fetch models from ${providerName}:`, error);
      }
    }

    // Step 3: Register any source models that weren't in providers
    for (const [key, sourceModel] of sourceModels.entries()) {
      if (!this.models.has(key)) {
        this.registerModel(sourceModel);
      }
    }
  }

}
