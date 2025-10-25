/**
 * Replicate Provider
 *
 * Provider for Replicate API with model adapter support.
 * Replicate has no consistent API - each model has its own input/output schema.
 * Users must register ModelAdapters for each model they want to use.
 */

import Replicate from 'replicate';
import type {
  Provider,
  ModelInfo,
  ModelCapability,
  ModelTier,
  ModelTransformer,
  ImageGenerationRequest,
  ImageGenerationResponse,
  TranscriptionRequest,
  TranscriptionResponse,
  SpeechRequest,
  SpeechResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  AIBaseContext,
  AIBaseTypes,
} from '@aits/ai';
import type { Executor, Streamer, Request, Response, Chunk } from '@aits/core';
import { detectCapabilitiesFromModality } from '@aits/ai';

// ============================================================================
// Configuration
// ============================================================================

export interface ReplicateConfig {
  apiKey: string;
  baseUrl?: string;
  /**
   * Model-specific transformers for request/response conversion
   * Map of model ID (owner/name) to transformer
   */
  transformers?: Record<string, ModelTransformer>;
}

// ============================================================================
// Types from Replicate API
// ============================================================================

interface ReplicateModel {
  url: string;
  owner: string;
  name: string;
  description: string | null;
  visibility: string;
  github_url: string | null;
  paper_url: string | null;
  license_url: string | null;
  run_count: number;
  cover_image_url: string | null;
  default_example: {
    model: string;
    version: string;
    input: Record<string, unknown>;
    output: unknown;
  } | null;
  latest_version: {
    id: string;
    created_at: string;
    cog_version: string;
    openapi_schema: {
      info: {
        title: string;
        version: string;
      };
      paths: Record<string, unknown>;
      components: {
        schemas: {
          Input?: {
            type: string;
            properties: Record<string, unknown>;
            required?: string[];
          };
          Output?: {
            type: string;
            properties?: Record<string, unknown>;
            items?: unknown;
          };
        };
      };
    };
  } | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

function createClient(config: ReplicateConfig): Replicate {
  return new Replicate({
    auth: config.apiKey,
    baseUrl: config.baseUrl,
  });
}

/**
 * Convert Replicate model to ModelInfo
 */
function convertModel(model: ReplicateModel): ModelInfo {
  const modelId = `${model.owner}/${model.name}`;

  // Try to detect capabilities from schema
  const capabilities = new Set<ModelCapability>();

  // Check if it's likely an image model based on name/description
  const lowerName = model.name.toLowerCase();
  const lowerDesc = (model.description || '').toLowerCase();

  if (lowerName.includes('stable-diffusion') ||
      lowerName.includes('sdxl') ||
      lowerName.includes('flux') ||
      lowerName.includes('imagen') ||
      lowerDesc.includes('image generation') ||
      lowerDesc.includes('text-to-image')) {
    capabilities.add('image');
  }

  if (lowerName.includes('whisper') ||
      lowerName.includes('transcribe') ||
      lowerDesc.includes('speech-to-text') ||
      lowerDesc.includes('transcription')) {
    capabilities.add('hearing');
  }

  if (lowerName.includes('tts') ||
      lowerName.includes('speech') ||
      lowerDesc.includes('text-to-speech')) {
    capabilities.add('audio');
  }

  if (lowerName.includes('embed') ||
      lowerDesc.includes('embedding')) {
    capabilities.add('embedding');
  }

  if (lowerName.includes('llm') ||
      lowerName.includes('chat') ||
      lowerName.includes('gpt') ||
      lowerName.includes('llama') ||
      lowerDesc.includes('language model')) {
    capabilities.add('chat');
  }

  // Determine tier based on popularity
  let tier: ModelTier = 'experimental';
  if (model.run_count > 1000000) {
    tier = 'flagship';
  } else if (model.run_count > 100000) {
    tier = 'efficient';
  }

  return {
    id: modelId,
    provider: 'replicate',
    name: model.name,
    capabilities,
    pricing: {
      inputTokensPer1M: 0, // Replicate pricing varies by model, set via overrides
      outputTokensPer1M: 0,
      requestCost: 0,
    },
    contextWindow: 0, // Unknown without model-specific info
    maxOutputTokens: undefined,
    tier,
    metadata: {
      owner: model.owner,
      description: model.description,
      runCount: model.run_count,
      githubUrl: model.github_url,
      paperUrl: model.paper_url,
      coverImageUrl: model.cover_image_url,
    },
  };
}

// ============================================================================
// Provider Implementation
// ============================================================================

export class ReplicateProvider implements Provider<ReplicateConfig> {
  readonly name = 'replicate';
  readonly config: ReplicateConfig;

  constructor(config: ReplicateConfig) {
    this.config = config;
  }

  /**
   * List available models from Replicate
   *
   * Note: This only lists models from specific collections.
   * Users can still use any Replicate model by specifying the full owner/name.
   */
  async listModels(config?: ReplicateConfig): Promise<ModelInfo[]> {
    const repConfig = config || this.config;
    const client = createClient(repConfig);

    try {
      // Get featured/popular models from Replicate
      // We'll fetch a few popular collections
      const collections = [
        'text-to-image',
        'image-to-text',
        'text-to-speech',
        'speech-to-text',
      ];

      const allModels: ModelInfo[] = [];

      for (const collection of collections) {
        try {
          // Fetch models from collection
          const modelsIterator = await client.collections.get(collection);

          if (modelsIterator.models) {
            for (const model of modelsIterator.models) {
              try {
                allModels.push(convertModel(model as ReplicateModel));
              } catch (error) {
                console.warn(`Failed to convert Replicate model ${model.name}:`, error);
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch Replicate collection ${collection}:`, error);
        }
      }

      return allModels;
    } catch (error) {
      console.error('Failed to list Replicate models:', error);
      return [];
    }
  }

  /**
   * Check Replicate API health
   */
  async checkHealth(config?: ReplicateConfig): Promise<boolean> {
    try {
      const repConfig = config || this.config;
      const client = createClient(repConfig);

      // Try to fetch account info as a health check
      await client.models.list();
      return true;
    } catch (error) {
      console.error('Replicate health check failed:', error);
      return false;
    }
  }

  /**
   * Get transformer for a specific model
   */
  private getTransformer(modelId: string, config?: ReplicateConfig): ModelTransformer | undefined {
    const repConfig = config || this.config;
    return repConfig.transformers?.[modelId];
  }

  /**
   * Create executor for chat/completion
   *
   * Note: Chat requires a model transformer in config for request/response conversion
   */
  createExecutor<TContext>(config?: ReplicateConfig): Executor<TContext, any> {
    const repConfig = config || this.config;

    return async (request: Request, ctx, metadata, signal) => {
      // Extract model ID from metadata
      const modelId = (metadata as any)?.model;
      if (!modelId) {
        throw new Error('Replicate executor requires model ID in metadata');
      }

      const transformer = this.getTransformer(modelId, repConfig);
      if (!transformer?.chat?.convertRequest || !transformer?.chat?.parseResponse) {
        throw new Error(
          `Replicate chat for model "${modelId}" requires a ModelTransformer with chat.convertRequest and chat.parseResponse. ` +
          'Add a transformer to your ReplicateConfig.transformers.'
        );
      }

      const client = createClient(repConfig);

      // Convert request using transformer
      const replicateInput = transformer.chat.convertRequest(request, ctx);

      // Run prediction
      const output = await client.run(modelId as any, { input: replicateInput as any });

      // Parse response using transformer
      return transformer.chat.parseResponse(output, ctx);
    };
  }

  /**
   * Create streamer for chat/completion
   */
  createStreamer<TContext>(config?: ReplicateConfig): Streamer<TContext, any> {
    const repConfig = config || this.config;

    return async function* (request: Request, ctx, metadata, signal) {
      // Extract model ID from metadata
      const modelId = (metadata as any)?.model;
      if (!modelId) {
        throw new Error('Replicate streamer requires model ID in metadata');
      }

      const transformer = repConfig.transformers?.[modelId];
      if (!transformer?.chat?.convertRequest || !transformer?.chat?.parseChunk) {
        throw new Error(
          `Replicate streaming chat for model "${modelId}" requires a ModelTransformer with chat.convertRequest and chat.parseChunk. ` +
          'Add a transformer to your ReplicateConfig.transformers.'
        );
      }

      const client = createClient(repConfig);

      // Convert request using transformer
      const replicateInput = transformer.chat.convertRequest(request, ctx);

      // Stream prediction
      for await (const event of client.stream(modelId as any, { input: replicateInput as any })) {
        // Parse chunk using transformer
        const chunk = transformer.chat.parseChunk!(event, ctx);
        yield chunk;
      }

      // Return final response if parseResponse is available
      if (transformer.chat.parseResponse) {
        return transformer.chat.parseResponse(null as any, ctx);
      }

      return { content: '', finishReason: 'stop' as const, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
    };
  }

  /**
   * Generate image using Replicate
   *
   * Requires a ModelTransformer for the specific model being used.
   */
  async generateImage(
    request: ImageGenerationRequest,
    ctx: AIBaseContext<AIBaseTypes>,
    config?: ReplicateConfig
  ): Promise<ImageGenerationResponse> {
    const repConfig = config || this.config;
    const client = createClient(repConfig);

    const model = request.model || ctx.metadata?.model;
    if (!model) {
      throw new Error('Model must be specified for Replicate image generation');
    }

    const transformer = this.getTransformer(model, repConfig);
    if (!transformer?.imageGenerate?.convertRequest || !transformer?.imageGenerate?.parseResponse) {
      throw new Error(
        `Replicate image generation for model "${model}" requires a ModelTransformer with imageGenerate.convertRequest and imageGenerate.parseResponse. ` +
        'Add a transformer to your ReplicateConfig.transformers.'
      );
    }

    try {
      // Convert request using transformer
      const modelInput = transformer.imageGenerate.convertRequest(request, ctx);

      // Run the model
      const output = await client.run(
        request.model as `${string}/${string}`,
        { input: modelInput as Record<string, unknown> },
      );

      // Parse response using transformer
      return transformer.imageGenerate.parseResponse(output, ctx);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Replicate image generation failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Transcribe audio using Replicate
   *
   * Requires a ModelTransformer for the specific model being used.
   */
  async transcribe<TContext>(
    request: TranscriptionRequest,
    ctx: TContext,
    config?: ReplicateConfig
  ): Promise<TranscriptionResponse> {
    const repConfig = config || this.config;
    const client = createClient(repConfig);

    if (!request.model) {
      throw new Error('Model must be specified for Replicate transcription');
    }

    const transformer = this.getTransformer(request.model, repConfig);
    if (!transformer?.transcribe?.convertRequest || !transformer?.transcribe?.parseResponse) {
      throw new Error(
        `Replicate transcription for model "${request.model}" requires a ModelTransformer with transcribe.convertRequest and transcribe.parseResponse. ` +
        'Add a transformer to your ReplicateConfig.transformers.'
      );
    }

    try {
      // Convert request using transformer
      const modelInput = transformer.transcribe.convertRequest(request, ctx);

      // Run the model
      const output = await client.run(
        request.model as `${string}/${string}`,
        { input: modelInput as Record<string, unknown> },
      );

      // Parse response using transformer
      return transformer.transcribe.parseResponse(output, ctx);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Replicate transcription failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate speech using Replicate
   *
   * Requires a ModelTransformer for the specific model being used.
   */
  async speech<TContext>(
    request: SpeechRequest,
    ctx: TContext,
    config?: ReplicateConfig
  ): Promise<SpeechResponse> {
    const repConfig = config || this.config;
    const client = createClient(repConfig);

    if (!request.model) {
      throw new Error('Model must be specified for Replicate speech generation');
    }

    const transformer = this.getTransformer(request.model, repConfig);
    if (!transformer?.speech?.convertRequest || !transformer?.speech?.parseResponse) {
      throw new Error(
        `Replicate speech generation for model "${request.model}" requires a ModelTransformer with speech.convertRequest and speech.parseResponse. ` +
        'Add a transformer to your ReplicateConfig.transformers.'
      );
    }

    try {
      // Convert request using transformer
      const modelInput = transformer.speech.convertRequest(request, ctx);

      // Run the model
      const output = await client.run(
        request.model as `${string}/${string}`,
        { input: modelInput as Record<string, unknown> },
      );

      // Parse response using transformer
      return transformer.speech.parseResponse(output, ctx);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Replicate speech generation failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate embeddings using Replicate
   *
   * Requires a ModelTransformer for the specific model being used.
   */
  async embed<TContext>(
    request: EmbeddingRequest,
    ctx: TContext,
    config?: ReplicateConfig
  ): Promise<EmbeddingResponse> {
    const repConfig = config || this.config;
    const client = createClient(repConfig);

    if (!request.model) {
      throw new Error('Model must be specified for Replicate embeddings');
    }

    const transformer = this.getTransformer(request.model, repConfig);
    if (!transformer?.embed?.convertRequest || !transformer?.embed?.parseResponse) {
      throw new Error(
        `Replicate embedding generation for model "${request.model}" requires a ModelTransformer with embed.convertRequest and embed.parseResponse. ` +
        'Add a transformer to your ReplicateConfig.transformers.'
      );
    }

    try {
      // Convert request using transformer
      const modelInput = transformer.embed.convertRequest(request, ctx);

      // Run the model
      const output = await client.run(
        request.model as `${string}/${string}`,
        { input: modelInput as Record<string, unknown> },
      );

      // Parse response using transformer
      return transformer.embed.parseResponse(output, ctx);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Replicate embedding generation failed: ${error.message}`);
      }
      throw error;
    }
  }
}
