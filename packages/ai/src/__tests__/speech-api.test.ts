/**
 * Speech and Transcribe API Tests
 *
 * Tests for Speech (TTS) and Transcribe (STT) APIs.
 */

import { AI } from '../ai';
import { createMockProvider } from './mocks/provider.mock';
import type { SpeechRequest, TranscriptionRequest } from '../types';

describe('Speech API', () => {
  describe('Text-to-Speech', () => {
    it('should generate speech', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const request: SpeechRequest = {
        text: 'Hello world'
      };

      const response = await ai.speech.get(request);

      expect(response).toBeDefined();
      expect(response.audio).toBeDefined();
    });

    it('should generate speech with voice', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const request: SpeechRequest = {
        text: 'Hello',
        voice: 'alloy'
      };

      const response = await ai.speech.get(request);

      expect(response).toBeDefined();
    });

    it('should use specified TTS model', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const request: SpeechRequest = {
        text: 'Test'
      };

      const response = await ai.speech.get(request, {
        metadata: { model: 'provider1-tts' },
      });

      expect(response).toBeDefined();
    });

    it('should call hooks for speech generation', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const beforeRequest = jest.fn();
      const afterRequest = jest.fn();

      const ai = AI.with()
        .providers({ provider1 })
        .create({})
        .withHooks({
          beforeRequest,
          afterRequest
        });

      await ai.registry.refresh();

      const request: SpeechRequest = {
        text: 'Hello'
      };

      await ai.speech.get(request);

      expect(beforeRequest).toHaveBeenCalled();
      expect(afterRequest).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should throw when no speech model available', async () => {
      const provider1 = createMockProvider({
        name: 'provider1',
        models: []
      });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const request: SpeechRequest = {
        text: 'Test'
      };

      await expect(ai.speech.get(request)).rejects.toThrow();
    });
  });
});

describe('Transcribe API', () => {
  describe('Speech-to-Text', () => {
    it('should transcribe audio', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const request: TranscriptionRequest = {
        audio: Buffer.from('audio-data')
      };

      const response = await ai.transcribe.get(request);

      expect(response).toBeDefined();
      expect(response.text).toBeDefined();
      expect(typeof response.text).toBe('string');
    });

    it('should transcribe with language hint', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const request: TranscriptionRequest = {
        audio: Buffer.from('audio-data'),
        language: 'en'
      };

      const response = await ai.transcribe.get(request);

      expect(response).toBeDefined();
    });

    it('should use specified transcription model', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const request: TranscriptionRequest = {
        audio: Buffer.from('audio-data')
      };

      const response = await ai.transcribe.get(request, {
        metadata: { model: 'provider1-whisper' },
      });

      expect(response).toBeDefined();
    });

    it('should stream transcription', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const request: TranscriptionRequest = {
        audio: Buffer.from('audio-data')
      };

      const chunks = [];
      for await (const chunk of ai.transcribe.stream(request)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should call hooks for transcription', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const beforeRequest = jest.fn();
      const afterRequest = jest.fn();

      const ai = AI.with()
        .providers({ provider1 })
        .create({})
        .withHooks({
          beforeRequest,
          afterRequest
        });

      await ai.registry.refresh();

      const request: TranscriptionRequest = {
        audio: Buffer.from('audio-data')
      };

      await ai.transcribe.get(request);

      expect(beforeRequest).toHaveBeenCalled();
      expect(afterRequest).toHaveBeenCalled();
    });

    it('should track usage for transcription', async () => {
      const provider1 = createMockProvider({ name: 'provider1' });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const request: TranscriptionRequest = {
        audio: Buffer.from('audio-data')
      };

      const response = await ai.transcribe.get(request);

      expect(response.usage).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw when no transcription model available', async () => {
      const provider1 = createMockProvider({
        name: 'provider1',
        models: []
      });

      const ai = AI.with()
        .providers({ provider1 })
        .create({});

      await ai.registry.refresh();

      const request: TranscriptionRequest = {
        audio: Buffer.from('audio-data')
      };

      await expect(ai.transcribe.get(request)).rejects.toThrow();
    });
  });
});
