/**
 * OpenRouter Model Source
 *
 * Fetches model information from OpenRouter API to enrich all providers
 * with comprehensive model metadata (pricing, capabilities, ZDR support).
 */

import type { ModelInfo, ModelSource } from '@aits/ai';
import {
  detectCapabilitiesFromModality,
  detectTier,
} from '@aits/ai';
import { OpenRouterModel, ZDRModel } from './types';

/**
 * Configuration for OpenRouter model source
 */
export interface OpenRouterSourceConfig {
  apiKey?: string;
  includeZDR?: boolean;
}

/**
 * Fetch ZDR (Zero Data Retention) compliant models
 */
export async function fetchZDRModels(apiKey?: string): Promise<Set<string>> {
  try {
    const effectiveKey = apiKey ?? process.env.OPENROUTER_API_KEY;
    const response = await fetch('https://openrouter.ai/api/v1/endpoints/zdr', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': effectiveKey ? `Bearer ${effectiveKey}` : undefined,
      },
    });

    if (!response.ok) {
      console.warn('Failed to fetch ZDR models from OpenRouter');
      return new Set();
    }

    const data = (await response.json()) as { data: ZDRModel[] };
    // The model_name field contains the model ID in provider/model format
    return new Set(data.data.map((model) => model.model_name));
  } catch (error) {
    console.warn('Error fetching ZDR models:', error);
    return new Set();
  }
}

/**
 * Fetch all OpenRouter models
 * @returns 
 */
export async function fetchModels(apiKey?: string): Promise<OpenRouterModel[]> {
  const effectiveKey = apiKey ?? process.env.OPENROUTER_API_KEY;
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': effectiveKey ? `Bearer ${effectiveKey}` : undefined,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }
  const data = (await response.json()) as { data: OpenRouterModel[] };
  return data.data;
}

/**
 * Convert OpenRouter model to ModelInfo
 */
function convertOpenRouterModel(model: OpenRouterModel, zdrModelIds: Set<string>): ModelInfo {
  const capabilities = detectCapabilitiesFromModality(model.architecture.modality, model.id);
  const tier = detectTier(model.name);
  
  // Update ZDR support from ZDR endpoint (more reliable)
  if (zdrModelIds.has(model.id)) {
    capabilities.add('zdr');
  }

  // Extract provider from model ID (format: provider/model-name)
  const provider = model.id.includes('/') ? model.id.split('/')[0] : 'unknown';

  return {
    provider,
    id: model.id,
    name: model.name,
    capabilities,
    tier,
    pricing: {
      inputTokensPer1M: parseFloat(model.pricing.prompt) * 1_000_000,
      outputTokensPer1M: parseFloat(model.pricing.completion) * 1_000_000,
      imageInputPer1M: model.pricing.image ? parseFloat(model.pricing.image) * 1_000_000 : undefined,
      requestCost: model.pricing.request ? parseFloat(model.pricing.request) : undefined,
    },
    contextWindow: model.context_length,
    maxOutputTokens: model.top_provider.max_completion_tokens ?? undefined,
    metadata: {
      description: model.description,
      architecture: model.architecture,
      source: 'openrouter',
    },
  };
}

/**
 * OpenRouter model source implementation
 */
export class OpenRouterModelSource implements ModelSource {
  readonly name = 'openrouter';
  private config: OpenRouterSourceConfig;

  constructor(config: OpenRouterSourceConfig = {}) {
    this.config = config;
  }

  async fetchModels(config?: Record<string, unknown>): Promise<ModelInfo[]> {
    const effectiveConfig = { ...this.config, ...config } as OpenRouterSourceConfig;

    try {
      // Fetch both models and ZDR models in parallel if ZDR is enabled
      const [models, zdrModels] = await Promise.all([
        fetchModels(effectiveConfig.apiKey),
        effectiveConfig.includeZDR !== false ? fetchZDRModels(effectiveConfig.apiKey) : Promise.resolve(new Set<string>()),
      ]);

      // Convert models and update ZDR support
      return models.map((model) => convertOpenRouterModel(model, zdrModels));
    } catch (error) {
      console.error('Failed to fetch models from OpenRouter:', error);
      throw error;
    }
  }
}
