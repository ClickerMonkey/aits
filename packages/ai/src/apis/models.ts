/**
 * Models API
 *
 * Provides access to model information, search, and discovery.
 * Use this API to explore available models, find models with specific capabilities,
 * or refresh model listings from providers.
 *
 * @example
 * ```typescript
 * // List all models
 * const models = ai.models.list();
 * console.log(`Found ${models.length} models`);
 *
 * // Get specific model
 * const gpt4 = ai.models.get('gpt-4');
 * console.log(gpt4?.capabilities);
 *
 * // Search for vision models
 * const visionModels = ai.models.search({
 *   required: ['chat', 'vision'],
 *   weights: { cost: 0.7, speed: 0.3 }
 * });
 *
 * // Refresh model listings
 * await ai.models.refresh();
 * ```
 */

import type { ModelRegistry } from '../registry';
import type {
  AIBaseMetadata,
  ModelInfo,
  Providers,
  ScoredModel,
  SelectedModel,
} from '../types';

/**
 * ModelsAPI provides methods for browsing and searching AI models.
 */
export class ModelsAPI<TProviders extends Providers> {
  constructor(private registry: ModelRegistry<TProviders>) {}

  /**
   * List all available models across all providers.
   *
   * @returns Array of all registered models
   *
   * @example
   * ```typescript
   * const models = ai.models.list();
   * models.forEach(model => {
   *   console.log(`${model.provider}/${model.id}: ${model.capabilities}`);
   * });
   * ```
   */
  list(providedOnly: boolean = false): ModelInfo[] {
    return providedOnly ? this.registry.providedModels() : this.registry.listModels();
  }

  /**
   * Get a specific model by ID.
   * Supports both "provider/model" (e.g., "openai/gpt-4") and "model" formats.
   * When using just the model name, provider order determines which one is returned.
   *
   * @param id - Model identifier
   * @returns Model info or undefined if not found
   *
   * @example
   * ```typescript
   * const model = ai.models.get('gpt-4');
   * // or
   * const model = ai.models.get('openai/gpt-4');
   * ```
   */
  get(id: string): ModelInfo | undefined {
    return this.registry.getModel(id);
  }

  /**
   * Search models based on criteria and get scored results.
   * Models are scored based on capability matching and selection weights.
   *
   * @param criteria - Search criteria including capabilities, providers, and weights
   * @returns Array of models with scores, sorted by descending score
   *
   * @example
   * ```typescript
   * // Find best model for structured output
   * const results = ai.models.search({
   *   required: ['chat', 'structured'],
   *   optional: ['vision'],
   *   weights: { cost: 0.6, speed: 0.4 },
   *   providers: { allow: ['openai', 'anthropic'] }
   * });
   *
   * console.log(`Best match: ${results[0].model.id} (score: ${results[0].score})`);
   * ```
   */
  search(criteria: AIBaseMetadata<TProviders>): ScoredModel[] {
    return this.registry.searchModels(criteria);
  }

  /**
   * Select a model based on criteria.
   * Returns the highest scored model or undefined if none match.
   * 
   * @param criteria 
   */
  select(criteria: AIBaseMetadata<TProviders>): SelectedModel<TProviders, keyof TProviders> | undefined {
    return this.registry.selectModel(criteria);
  }

  /**
   * Refresh models from all providers and model sources.
   * This re-fetches model information, useful for discovering new models
   * or updating pricing information.
   *
   * @example
   * ```typescript
   * console.log('Refreshing models...');
   * await ai.models.refresh();
   * console.log(`Now have ${ai.models.list().length} models`);
   * ```
   */
  async refresh(): Promise<void> {
    await this.registry.refresh();
  }
}
