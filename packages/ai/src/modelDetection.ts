/**
 * Model Detection Utilities
 *
 * Shared utilities for detecting model capabilities, tiers, and other metadata
 * independently of provider implementations. This allows providers to be used
 * interchangeably (e.g., using OpenAI models through OpenRouter).
 */

import type { ModelCapability, ModelTier } from './types';

/**
 * Model metadata for capability detection
 */
export interface ModelMetadata {
  id: string;
  name: string;
  modality?: string;
  capabilities?: string[];
}

/**
 * Detect model tier from model name
 * Note: This should only be used as a fallback when provider doesn't provide tier info
 */
export function detectTier(name: string): ModelTier {
  const n = name.toLowerCase();

  // Check name for tier indicators
  if (n.includes('flagship')) {
    return 'flagship';
  }

  if (
    n.includes('preview') ||
    n.includes('experimental') ||
    n.includes('alpha') ||
    n.includes('beta')
  ) {
    return 'experimental';
  }

  if (n.includes('legacy')) {
    return 'legacy';
  }

  if (
    n.includes('mini') ||
    n.includes('small') ||
    n.includes('haiku') ||
    n.includes('efficient')
  ) {
    return 'efficient';
  }

  // Default to flagship (assume modern model if no indicators)
  return 'flagship';
}

/**
 * Detect capabilities from modality string (OpenRouter format)
 */
export function detectCapabilitiesFromModality(
  modality: string,
  modelId: string
): Set<ModelCapability> {
  const capabilities = new Set<ModelCapability>();
  const lowerModality = modality.toLowerCase();

  const [input, output = input] = lowerModality.split('->').map((s) => s.trim());

  // Text capabilities
  if (output.includes('text')) {
    capabilities.add('chat');
    capabilities.add('json');
    capabilities.add('tools');
    // structured output can't be detected from this
  }

  // Vision capabilities
  if (input.includes('image')) {
    capabilities.add('vision');
  }

  // Image generation
  if (output.includes('image')) {
    capabilities.add('image');
  }

  // Audio capabilities
  if (input.includes('audio')) {
    capabilities.add('hearing');
  }
  if (output.includes('audio')) {
    capabilities.add('audio');
  }

  // Embedding
  if (output.includes('embedding') || output.includes('vector')) {
    capabilities.add('embedding');
  }

  return capabilities;
}


/**
 * Detect ZDR (Zero Data Retention) support from provider metadata
 */
export function detectZDRFromModeration(isModerated: boolean): boolean {
  // If a model is NOT moderated, it typically means ZDR is supported
  return !isModerated;
}
