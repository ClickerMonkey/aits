import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image?: string;
    prompt: string;
    max_tokens?: number;
    system_prompt?: string;
    max_image_resolution?: number;
  };
  Output: string[];
};

export default {
  "anthropic/claude-3.7-sonnet": (() => {
    const transformer: ReplicateTransformer = {
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const messages = request.messages || [];
          const systemMessage = messages.find((m) => m.role === 'system');
          const lastUserMessage = messages.filter((m) => m.role === 'user').pop();

          let prompt = '';
          let image: string | undefined;

          if (lastUserMessage) {
            if (Array.isArray(lastUserMessage.content)) {
              for (const part of lastUserMessage.content) {
                if (part.type === 'text') {
                  prompt += part.content;
                } else if (part.type === 'image') {
                  image = await toURL(part.content);
                }
              }
            } else {
              prompt = String(lastUserMessage.content);
            }
          }

          return {
            prompt: prompt,
            system_prompt: systemMessage ? String(systemMessage.content) : undefined,
            image,
            max_tokens: request.maxTokens,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            content: response.join(''),
            finishReason: 'stop',
          };
        },
        parseChunk: async (chunk: string, ctx) => {
          return {
            content: chunk,
          };
        },
      },
    };
    return transformer;
  })(),
}