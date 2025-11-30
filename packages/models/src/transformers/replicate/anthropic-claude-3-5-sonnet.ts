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
  "anthropic/claude-3.5-sonnet": (() => {
    const transformer: ReplicateTransformer = {
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const messages = request.messages;
          let systemPrompt = "";
          let prompt = "";
          let imageUrl: string | undefined;

          for (const msg of messages) {
            if (msg.role === 'system') {
              systemPrompt += (typeof msg.content === 'string' ? msg.content : "") + "\n";
            } else {
              const role = msg.role === 'user' ? 'Human' : 'Assistant';
              prompt += `\n\n${role}: `;
              
              if (typeof msg.content === 'string') {
                prompt += msg.content;
              } else if (Array.isArray(msg.content)) {
                for (const part of msg.content) {
                  if (part.type === 'text') {
                    prompt += part.content;
                  } else if (part.type === 'image') {
                    imageUrl = await toURL(part.content);
                  }
                }
              }
            }
          }
          
          prompt += "\n\nAssistant:";

          return {
            prompt: prompt.trim(),
            system_prompt: systemPrompt.trim(),
            image: imageUrl,
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
        parseChunk: async (chunk: any, ctx) => {
          return {
            content: typeof chunk === 'string' ? chunk : '',
          };
        },
      },
    };
    return transformer;
  })()
}