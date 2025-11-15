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
export declare function detectTier(name: string): ModelTier;
/**
 * Detect capabilities from modality string (OpenRouter format)
 */
export declare function detectCapabilitiesFromModality(modality: string, modelId: string): Set<ModelCapability>;
/**
 * Detect ZDR (Zero Data Retention) support from provider metadata
 */
export declare function detectZDRFromModeration(isModerated: boolean): boolean;
//# sourceMappingURL=modelDetection.d.ts.map