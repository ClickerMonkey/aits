/**
 * Model Transformers
 *
 * Maps model IDs to their transformer implementations.
 * Transformers handle conversion between @aeye request/response format
 * and provider-specific formats for models with non-standard APIs.
 */

import type { ModelTransformer } from '@aeye/ai';

/**
 * Registry of model transformers by model ID
 *
 * Example:
 * ```typescript
 * import { sdxlTransformer } from './replicate/sdxl';
 *
 * export const transformers: Record<string, ModelTransformer> = {
 *   'stability-ai/sdxl': sdxlTransformer,
 *   'black-forest-labs/flux-schnell': fluxTransformer,
 * };
 * ```
 */
export const transformers: Record<string, ModelTransformer> = {
  // Transformers will be added here as they are implemented
};