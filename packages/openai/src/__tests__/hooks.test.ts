/**
 * OpenAI Provider Hooks Unit Tests
 *
 * Tests for the provider hook functionality.
 */

import { OpenAIProvider } from '../openai';
import type { Request, Response, ImageGenerationRequest, ImageGenerationResponse, AIContextAny } from '@aeye/ai';
import { AI } from '@aeye/ai';

// Mock the OpenAI SDK
let mockOpenAI: any;
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => mockOpenAI);
});

const ctxDefault: AIContextAny = { ai: AI.with().providers({}).create({}), metadata: {} };

describe('OpenAIProvider Hooks', () => {
  let provider: OpenAIProvider;
  let preRequestHook: jest.Mock;
  let postRequestHook: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock hooks
    preRequestHook = jest.fn();
    postRequestHook = jest.fn();

    // Create mock OpenAI instance
    mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn()
        }
      },
      images: {
        generate: jest.fn()
      },
      embeddings: {
        create: jest.fn()
      },
      models: {
        list: jest.fn()
      }
    };
  });

  describe('Chat Hooks', () => {
    it('should call pre and post hooks for chat executor', async () => {
      provider = new OpenAIProvider({
        apiKey: 'test-api-key',
        hooks: {
          chat: {
            preRequest: preRequestHook,
            postRequest: postRequestHook
          }
        }
      });

      const request: Request = {
        messages: [{ role: 'user', content: 'Hello' }]
      };

      // Mock the chat completion response
      const mockChatResponse = {
        withResponse: jest.fn().mockResolvedValue({
          response: { ok: true, headers: new Map() },
          data: {
            choices: [{
              message: { content: 'Hi there!' },
              finish_reason: 'stop'
            }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15
            }
          }
        })
      };
      mockOpenAI.chat.completions.create.mockReturnValue(mockChatResponse);

      const executor = provider.createExecutor();
      const response = await executor(request, ctxDefault, { model: 'gpt-4' });

      // Check that pre-request hook was called
      expect(preRequestHook).toHaveBeenCalledTimes(1);
      expect(preRequestHook).toHaveBeenCalledWith(request, ctxDefault, { model: 'gpt-4' });

      // Check that post-request hook was called
      expect(postRequestHook).toHaveBeenCalledTimes(1);
      expect(postRequestHook).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          content: 'Hi there!',
          finishReason: 'stop'
        }),
        ctxDefault,
        { model: 'gpt-4' }
      );

      expect(response.content).toBe('Hi there!');
    });

    it('should call pre hook for chat streamer', async () => {
      provider = new OpenAIProvider({
        apiKey: 'test-api-key',
        hooks: {
          chat: {
            preRequest: preRequestHook,
            postRequest: postRequestHook
          }
        }
      });

      const request: Request = {
        messages: [{ role: 'user', content: 'Hello' }]
      };

      // Mock the streaming chat completion response
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            choices: [{
              delta: { content: 'Hi ' },
              finish_reason: null
            }],
            usage: null
          };
          yield {
            choices: [{
              delta: { content: 'there!' },
              finish_reason: 'stop'
            }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15
            }
          };
        }
      };

      const mockStreamResponse = {
        withResponse: jest.fn().mockResolvedValue({
          response: { ok: true, headers: new Map() },
          data: mockStream
        })
      };
      mockOpenAI.chat.completions.create.mockReturnValue(mockStreamResponse);

      const streamer = provider.createStreamer();
      const chunks: any[] = [];
      for await (const chunk of streamer(request, ctxDefault, { model: 'gpt-4' })) {
        chunks.push(chunk);
      }

      // Check that pre-request hook was called
      expect(preRequestHook).toHaveBeenCalledTimes(1);
      expect(preRequestHook).toHaveBeenCalledWith(request, ctxDefault, { model: 'gpt-4' });

      // Check that post-request hook was called after streaming completed
      expect(postRequestHook).toHaveBeenCalledTimes(1);
      expect(postRequestHook).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          content: 'Hi there!',
          finishReason: 'stop'
        }),
        ctxDefault,
        { model: 'gpt-4' }
      );
    });
  });

  describe('Image Generation Hooks', () => {
    it('should call pre and post hooks for image generation', async () => {
      provider = new OpenAIProvider({
        apiKey: 'test-api-key',
        hooks: {
          imageGenerate: {
            preRequest: preRequestHook,
            postRequest: postRequestHook
          }
        }
      });

      const request: ImageGenerationRequest = {
        prompt: 'A beautiful landscape'
      };

      // Mock the image generation response
      mockOpenAI.images.generate.mockResolvedValue({
        data: [{
          url: 'https://example.com/image.png'
        }]
      });

      const response = await provider.generateImage!(request, ctxDefault);

      // Check that pre-request hook was called
      expect(preRequestHook).toHaveBeenCalledTimes(1);
      expect(preRequestHook).toHaveBeenCalledWith(request, ctxDefault);

      // Check that post-request hook was called
      expect(postRequestHook).toHaveBeenCalledTimes(1);
      expect(postRequestHook).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          images: expect.arrayContaining([
            expect.objectContaining({
              url: 'https://example.com/image.png'
            })
          ])
        }),
        ctxDefault
      );

      expect(response.images[0].url).toBe('https://example.com/image.png');
    });
  });

  describe('Hook Error Handling', () => {
    it('should propagate errors from pre-request hooks', async () => {
      const errorMessage = 'Pre-request hook failed';
      preRequestHook.mockRejectedValue(new Error(errorMessage));

      provider = new OpenAIProvider({
        apiKey: 'test-api-key',
        hooks: {
          chat: {
            preRequest: preRequestHook
          }
        }
      });

      const request: Request = {
        messages: [{ role: 'user', content: 'Hello' }]
      };

      const executor = provider.createExecutor();
      await expect(executor(request, ctxDefault, { model: 'gpt-4' }))
        .rejects.toThrow(errorMessage);

      expect(preRequestHook).toHaveBeenCalledTimes(1);
    });
  });

  describe('Hook Omission', () => {
    it('should work without hooks configured', async () => {
      provider = new OpenAIProvider({
        apiKey: 'test-api-key'
      });

      const request: Request = {
        messages: [{ role: 'user', content: 'Hello' }]
      };

      // Mock the chat completion response
      const mockChatResponse = {
        withResponse: jest.fn().mockResolvedValue({
          response: { ok: true, headers: new Map() },
          data: {
            choices: [{
              message: { content: 'Hi there!' },
              finish_reason: 'stop'
            }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15
            }
          }
        })
      };
      mockOpenAI.chat.completions.create.mockReturnValue(mockChatResponse);

      const executor = provider.createExecutor();
      const response = await executor(request, ctxDefault, { model: 'gpt-4' });

      expect(response.content).toBe('Hi there!');
    });
  });
});
