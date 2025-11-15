/**
 * Model Registry
 *
 * Centralized model management with provider ordering and adapter registration.
 * Provider order ensures deterministic model resolution: first provider to return a model ID wins.
 */
import type { AIBaseMetadata, ModelCapability, ModelHandler, ModelInfo, ModelOverride, ModelSelectionWeights, ModelSource, Provider, Providers, ScoredModel, SelectedModel } from './types';
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
export declare function getProviderCapabilities(provider: Provider): Set<ModelCapability>;
export declare class ModelRegistry<TProviders extends Providers, TProviderKey extends keyof TProviders & string = keyof TProviders & string, TProvider extends TProviders[TProviderKey] = TProviders[TProviderKey]> {
    private models;
    private modelHandlers;
    private providers;
    private providerCapabilities;
    private modelSources;
    private modelOverrides;
    private defaultCostPerMillionTokens;
    private defaultWeights?;
    private weightProfiles;
    constructor(providers: TProviders, modelOverrides?: ModelOverride[], defaultCostPerMillionTokens?: number, modelSources?: ModelSource[], defaultWeights?: ModelSelectionWeights, weightProfiles?: Record<string, ModelSelectionWeights>);
    /**
     * Add model sources to the registry
     */
    addModelSources(sources: ModelSource[]): void;
    /**
     * Register a model in the registry
     *
     * Always registers under two keys:
     * - model.id (e.g., "gpt-4" or "openai/gpt-4")
     * - provider/model.id (e.g., "openai/gpt-4" or "openrouter/openai/gpt-4")
     *
     * On collision, models are merged
     */
    registerModel(model: ModelInfo<TProviderKey>): void;
    /**
     * Register multiple models
     */
    registerModels(models: ModelInfo<TProviderKey>[]): void;
    /**
     * Get a model by ID (checks all providers in order)
     */
    getModel(id: string): ModelInfo<TProviderKey> | undefined;
    /**
     * Gets the provider to use for a given model ID
     *
     * @param id
     * @returns
     */
    getProviderFor(id: string): [TProviderKey, TProvider] | [];
    /**
     * List all models
     */
    listModels(): ModelInfo<TProviderKey>[];
    /**
     * List models for which we have providers
     */
    providedModels(): ModelInfo<TProviderKey>[];
    /**
     * Search and score models based on criteria
     */
    searchModels(metadata: AIBaseMetadata<TProviders>): ScoredModel<TProviderKey>[];
    /**
     * Select best model based on criteria
     */
    selectModel(criteria: AIBaseMetadata<TProviders>): SelectedModel<TProviders, TProviderKey> | undefined;
    /**
     * Register a model handler
     */
    registerHandler(handler: ModelHandler<any>): void;
    /**
     * Get handler for a model
     */
    getHandler(provider: string, model: string): ModelHandler | undefined;
    /**
     * Get provider info
     */
    getProvider(name: TProviderKey): TProvider | undefined;
    /**
     * Get pre-computed capabilities for a provider
     * @param name - Provider name
     * @returns Set of capabilities the provider supports, or undefined if provider not found
     */
    getProviderCapabilities(name: TProviderKey): Set<ModelCapability> | undefined;
    /**
     * Score a model against criteria
     */
    private scoreModel;
    /**
     * Calculate weighted score for a model
     */
    private calculateWeightedScore;
    /**
     * Apply overrides to a model
     */
    private applyOverrides;
    /**
     * Merge two ModelInfo objects intelligently
     * Prefers non-default values and combines capabilities
     */
    private mergeModelInfo;
    /**
     * Refresh models from all providers and model sources
     */
    refresh(): Promise<void>;
}
//# sourceMappingURL=registry.d.ts.map