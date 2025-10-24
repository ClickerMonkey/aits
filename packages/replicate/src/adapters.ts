/**
 * Replicate Model Adapters
 *
 * Example adapters for popular Replicate models.
 * Users can copy and customize these for their needs.
 */

import type { ModelAdapter } from '@aits/ai';

// ============================================================================
// Image Generation Adapters
// ============================================================================

/**
 * Adapter for Flux Schnell (fast image generation)
 */
export const fluxSchnellAdapter: ModelAdapter = {
  modelId: 'black-forest-labs/flux-schnell',
  provider: 'replicate',

  imageGenerate: {
    convertRequest: (request) => {
      // Map standard sizes to aspect ratios
      const aspectRatioMap: Record<string, string> = {
        '1024x1024': '1:1',
        '1024x768': '4:3',
        '768x1024': '3:4',
        '1280x720': '16:9',
        '720x1280': '9:16',
        '1920x1080': '16:9',
        '1080x1920': '9:16',
      };

      return {
        input: {
          prompt: request.prompt,
          num_outputs: request.n || 1,
          aspect_ratio: aspectRatioMap[request.size || '1024x1024'] || '1:1',
          output_format: request.responseFormat === 'b64_json' ? 'png' : 'webp',
          output_quality: request.quality === 'hd' ? 100 : 80,
          num_inference_steps: request.quality === 'hd' ? 4 : 2,
        },
      };
    },

    parseResponse: (response: any) => ({
      images: Array.isArray(response)
        ? response.map((url: string) => ({ url }))
        : [{ url: response }],
      model: 'black-forest-labs/flux-schnell',
      cost: 0.003,
      revised_prompt: undefined,
    }),
  },
};

/**
 * Adapter for Flux Dev (high quality image generation)
 */
export const fluxDevAdapter: ModelAdapter = {
  modelId: 'black-forest-labs/flux-dev',
  provider: 'replicate',

  imageGenerate: {
    convertRequest: (request) => {
      const aspectRatioMap: Record<string, string> = {
        '1024x1024': '1:1',
        '1024x768': '4:3',
        '768x1024': '3:4',
        '1280x720': '16:9',
        '720x1280': '9:16',
      };

      return {
        input: {
          prompt: request.prompt,
          aspect_ratio: aspectRatioMap[request.size || '1024x1024'] || '1:1',
          num_outputs: request.n || 1,
          output_format: request.responseFormat === 'b64_json' ? 'png' : 'webp',
          output_quality: request.quality === 'hd' ? 100 : 80,
          guidance: 3.5,
          num_inference_steps: request.quality === 'hd' ? 50 : 28,
        },
      };
    },

    parseResponse: (response: any) => ({
      images: Array.isArray(response)
        ? response.map((url: string) => ({ url }))
        : [{ url: response }],
      model: 'black-forest-labs/flux-dev',
      cost: 0.055,
      revised_prompt: undefined,
    }),
  },
};

/**
 * Adapter for Stable Diffusion XL
 */
export const sdxlAdapter: ModelAdapter = {
  modelId: 'stability-ai/sdxl',
  provider: 'replicate',

  imageGenerate: {
    convertRequest: (request) => ({
      input: {
        prompt: request.prompt,
        negative_prompt: 'blurry, low quality, distorted',
        width: parseInt(request.size?.split('x')[0] || '1024'),
        height: parseInt(request.size?.split('x')[1] || '1024'),
        num_outputs: request.n || 1,
        scheduler: 'K_EULER',
        num_inference_steps: request.quality === 'hd' ? 50 : 25,
        guidance_scale: 7.5,
        refine: request.quality === 'hd' ? 'expert_ensemble_refiner' : 'no_refiner',
        high_noise_frac: 0.8,
      },
    }),

    parseResponse: (response: any) => ({
      images: Array.isArray(response)
        ? response.map((url: string) => ({ url }))
        : [{ url: response }],
      model: 'stability-ai/sdxl',
      cost: 0.018,
      revised_prompt: undefined,
    }),
  },
};

// ============================================================================
// Audio Transcription Adapters
// ============================================================================

/**
 * Adapter for Whisper (OpenAI's speech-to-text)
 */
export const whisperAdapter: ModelAdapter = {
  modelId: 'openai/whisper',
  provider: 'replicate',

  transcribe: {
    convertRequest: (request) => ({
      input: {
        audio: request.audio, // Can be URL or file path
        model: 'large-v3',
        language: request.language,
        temperature: request.temperature || 0,
        transcription: request.responseFormat || 'json',
        translate: false,
        suppress_tokens: '-1',
      },
    }),

    parseResponse: (response: any) => {
      // Handle different response formats
      let text = '';
      let segments = undefined;

      if (typeof response === 'string') {
        text = response;
      } else if (response.transcription) {
        text = response.transcription;
      } else if (response.text) {
        text = response.text;
      }

      if (response.segments) {
        segments = response.segments.map((seg: any) => ({
          id: seg.id,
          start: seg.start,
          end: seg.end,
          text: seg.text,
        }));
      }

      return {
        text,
        language: response.detected_language,
        duration: segments && segments.length > 0
          ? segments[segments.length - 1].end
          : undefined,
        segments,
        cost: 0.0001 * (response.duration || 0), // Approximate cost per second
      };
    },
  },
};

/**
 * Adapter for Whisper Large V3
 */
export const whisperLargeV3Adapter: ModelAdapter = {
  modelId: 'vaibhavs10/incredibly-fast-whisper',
  provider: 'replicate',

  transcribe: {
    convertRequest: (request) => ({
      input: {
        audio: request.audio,
        task: 'transcribe',
        language: request.language || 'en',
        timestamp: request.timestampGranularities?.includes('word') ? 'word' : 'chunk',
        batch_size: 64,
        diarization: false,
      },
    }),

    parseResponse: (response: any) => ({
      text: response.text || response.transcription || '',
      language: response.language,
      duration: response.duration,
      segments: response.chunks?.map((chunk: any, idx: number) => ({
        id: idx,
        start: chunk.timestamp[0],
        end: chunk.timestamp[1],
        text: chunk.text,
      })),
      cost: 0.00005 * (response.duration || 0),
    }),
  },
};

// ============================================================================
// Text-to-Speech Adapters
// ============================================================================

/**
 * Adapter for MusicGen (music/audio generation)
 */
export const musicGenAdapter: ModelAdapter = {
  modelId: 'meta/musicgen',
  provider: 'replicate',

  speech: {
    convertRequest: (request) => ({
      input: {
        prompt: request.text,
        model_version: 'stereo-large',
        duration: 8,
        temperature: 1.0,
        top_k: 250,
        top_p: 0.0,
        classifier_free_guidance: 3.0,
      },
    }),

    parseResponse: (response: any) => ({
      audioBuffer: response, // URL to audio file
      cost: 0.015,
    }),
  },
};

// ============================================================================
// Embedding Adapters
// ============================================================================

/**
 * Adapter for Embeddings models
 */
export const embeddingAdapter: ModelAdapter = {
  modelId: 'replicate/all-mpnet-base-v2',
  provider: 'replicate',

  embed: {
    convertRequest: (request) => ({
      input: {
        text_batch: request.texts,
      },
    }),

    parseResponse: (response: any) => ({
      embeddings: Array.isArray(response)
        ? response.map((embedding: number[], index: number) => ({
            embedding,
            index,
          }))
        : [],
      model: 'replicate/all-mpnet-base-v2',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
      cost: 0.0001 * (response.length || 0),
    }),
  },
};

// ============================================================================
// Export all adapters
// ============================================================================

/**
 * All available Replicate adapters
 */
export const replicateAdapters = {
  // Image generation
  fluxSchnell: fluxSchnellAdapter,
  fluxDev: fluxDevAdapter,
  sdxl: sdxlAdapter,

  // Audio transcription
  whisper: whisperAdapter,
  whisperLargeV3: whisperLargeV3Adapter,

  // Text-to-speech / Audio generation
  musicGen: musicGenAdapter,

  // Embeddings
  embedding: embeddingAdapter,
};

/**
 * Register all example adapters
 *
 * @example
 * ```typescript
 * import { registerAllReplicateAdapters } from '@server/ai/lib/providers/replicate-adapters';
 *
 * // Register all example adapters
 * registerAllReplicateAdapters();
 * ```
 */
export function registerAllReplicateAdapters(): void {
  const { registerModelAdapter } = require('../global');

  for (const adapter of Object.values(replicateAdapters)) {
    registerModelAdapter(adapter);
  }
}
