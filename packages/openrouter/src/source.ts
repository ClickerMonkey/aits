/**
 * OpenRouter Model Source
 *
 * Fetches model information from OpenRouter API to enrich all providers
 * with comprehensive model metadata (pricing, capabilities, ZDR support).
 */

import type { ModelSource, ModelInfo, ModelCapability } from '@aits/ai';
import {
  detectTier,
  detectCapabilitiesFromModality,
} from '@aits/ai';

/**
 * OpenRouter model response from API
 */
interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  architecture: {
    modality: string;
    tokenizer: string;
    instruct_type: string | null;
  };
  pricing: {
    prompt: string;
    completion: string;
    image?: string;
    request?: string;
  };
  top_provider: {
    context_length: number;
    max_completion_tokens: number | null;
    is_moderated: boolean;
  };
  description?: string;
}

/**
 * ZDR model info from OpenRouter ZDR endpoint
 */
interface ZDRModel {
  name: string;
  model_name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
    request: string;
    image: string;
  };
  provider_name: string;
  tag: string;
  quantization: string | null;
  max_completion_tokens: number | null;
  max_prompt_tokens: number | null;
  supported_parameters: string[];
  status: number;
  uptime_last_30m: number | null;
  supports_implicit_caching: boolean;
}

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
async function fetchZDRModels(): Promise<Set<string>> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/endpoints/zdr', {
      headers: {
        'Content-Type': 'application/json',
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
      const [modelsResponse, zdrModelIds] = await Promise.all([
        fetch('https://openrouter.ai/api/v1/models', {
          headers: effectiveConfig.apiKey
            ? {
                Authorization: `Bearer ${effectiveConfig.apiKey}`,
              }
            : {},
        }),
        effectiveConfig.includeZDR !== false ? fetchZDRModels() : Promise.resolve(new Set<string>()),
      ]);

      if (!modelsResponse.ok) {
        throw new Error(`Failed to fetch models: ${modelsResponse.statusText}`);
      }

      const data = (await modelsResponse.json()) as { data: OpenRouterModel[] };

      // Convert models and update ZDR support
      return data.data.map((model) => convertOpenRouterModel(model, zdrModelIds));
    } catch (error) {
      console.error('Failed to fetch models from OpenRouter:', error);
      throw error;
    }
  }
}
