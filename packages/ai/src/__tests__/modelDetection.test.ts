/**
 * Model Detection Tests
 *
 * Tests for model tier detection, capability detection from modality strings,
 * and ZDR detection.
 */

import { detectTier, detectCapabilitiesFromModality, detectZDRFromModeration } from '../modelDetection';

describe('Model Detection', () => {
  describe('detectTier', () => {
    it('should detect flagship from name', () => {
      expect(detectTier('gpt-4-flagship')).toBe('flagship');
      expect(detectTier('GPT-4-Flagship')).toBe('flagship');
      expect(detectTier('claude-3-opus-flagship')).toBe('flagship');
    });

    it('should detect experimental from preview/alpha/beta', () => {
      expect(detectTier('gpt-4-preview')).toBe('experimental');
      expect(detectTier('claude-3-alpha')).toBe('experimental');
      expect(detectTier('llama-beta')).toBe('experimental');
      expect(detectTier('model-experimental')).toBe('experimental');
    });

    it('should detect legacy models', () => {
      expect(detectTier('gpt-3-legacy')).toBe('legacy');
      expect(detectTier('claude-instant-legacy')).toBe('legacy');
    });

    it('should detect efficient models', () => {
      expect(detectTier('gpt-3.5-turbo-mini')).toBe('efficient');
      expect(detectTier('claude-haiku')).toBe('efficient');
      expect(detectTier('llama-small')).toBe('efficient');
      expect(detectTier('model-efficient')).toBe('efficient');
    });

    it('should default to flagship for unknown models', () => {
      expect(detectTier('gpt-4')).toBe('flagship');
      expect(detectTier('claude-3-opus')).toBe('flagship');
      expect(detectTier('unknown-model')).toBe('flagship');
    });
  });

  describe('detectCapabilitiesFromModality', () => {
    it('should detect chat capability from text modality', () => {
      const caps = detectCapabilitiesFromModality('text', 'gpt-4');

      expect(caps.has('chat')).toBe(true);
      expect(caps.has('json')).toBe(true);
      expect(caps.has('tools')).toBe(true);
    });

    it('should detect structured output for modern models', () => {
      const caps = detectCapabilitiesFromModality('text', 'gpt-4');

      expect(caps.has('structured')).toBe(true);
    });

    it('should not detect structured output for older models', () => {
      const caps1 = detectCapabilitiesFromModality('text', 'gpt-3.5-turbo');
      const caps2 = detectCapabilitiesFromModality('text', 'claude-instant-v1');

      expect(caps1.has('structured')).toBe(false);
      expect(caps2.has('structured')).toBe(false);
    });

    it('should detect vision capability', () => {
      const caps = detectCapabilitiesFromModality('text+image->text', 'gpt-4-vision');

      expect(caps.has('vision')).toBe(true);
      expect(caps.has('chat')).toBe(true);
    });

    it('should detect image generation capability', () => {
      const caps = detectCapabilitiesFromModality('text->image', 'dall-e-3');

      expect(caps.has('image')).toBe(true);
    });

    it('should detect hearing capability', () => {
      const caps = detectCapabilitiesFromModality('audio->text', 'whisper-1');

      expect(caps.has('hearing')).toBe(true);
    });

    it('should detect audio generation capability', () => {
      const caps = detectCapabilitiesFromModality('text->audio', 'tts-1');

      expect(caps.has('audio')).toBe(true);
    });

    it('should detect embedding capability', () => {
      const caps1 = detectCapabilitiesFromModality('embedding', 'text-embedding-ada');
      const caps2 = detectCapabilitiesFromModality('text->vector', 'embed-model');

      expect(caps1.has('embedding')).toBe(true);
      expect(caps2.has('embedding')).toBe(true);
    });

    it('should handle multiple capabilities', () => {
      const caps = detectCapabilitiesFromModality('text+image->text+audio', 'multimodal-model');

      expect(caps.has('chat')).toBe(true);
      expect(caps.has('vision')).toBe(true);
      expect(caps.has('audio')).toBe(true);
    });

    it('should handle case-insensitive modality strings', () => {
      const caps1 = detectCapabilitiesFromModality('TEXT', 'gpt-4');
      const caps2 = detectCapabilitiesFromModality('Text->Image', 'dalle');

      expect(caps1.has('chat')).toBe(true);
      expect(caps2.has('image')).toBe(true);
    });
  });

  describe('detectZDRFromModeration', () => {
    it('should detect ZDR when not moderated', () => {
      expect(detectZDRFromModeration(false)).toBe(true);
    });

    it('should not detect ZDR when moderated', () => {
      expect(detectZDRFromModeration(true)).toBe(false);
    });
  });
});
