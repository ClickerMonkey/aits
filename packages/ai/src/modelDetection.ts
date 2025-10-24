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

  // Text capabilities
  if (lowerModality.includes('text')) {
    capabilities.add('chat');
    capabilities.add('json');

    // Assume structured output for modern models (can be overridden)
    if (!modelId.includes('gpt-3.5') && !modelId.includes('claude-instant')) {
      capabilities.add('structured');
    }

    // Function calling for text models
    capabilities.add('tools');
  }

  // Vision capabilities
  if (lowerModality.includes('image') && lowerModality.includes('text->')) {
    capabilities.add('vision');
  }

  // Image generation
  if (lowerModality.includes('->image')) {
    capabilities.add('image');
  }

  // Audio capabilities
  if (lowerModality.includes('audio')) {
    if (lowerModality.includes('audio->text')) {
      capabilities.add('hearing');
    }
    if (lowerModality.includes('text->audio')) {
      capabilities.add('audio');
    }
  }

  // Embedding
  if (lowerModality.includes('embedding') || lowerModality.includes('text->vector')) {
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
