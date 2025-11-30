import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image?: string;
    prompt: string;
    max_tokens?: number;
    system_prompt?: string;
    extended_thinking?: boolean;
    max_image_resolution?: number;
    thinking_budget_tokens?: number;
  };
  Output: string[];
};

export default { 
  "anthropic/claude-4-sonnet": (() => {
    const transformer: ReplicateTransformer = { 
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let systemPrompt = "";
          let prompt = "";
          let imageUrl: string | undefined;

          for (const msg of request.messages) {
            if (msg.role === 'system') {
              systemPrompt += (typeof msg.content === 'string' ? msg.content : "") + "\n";
            } else {
              if (msg.role === 'user') prompt += "User: ";
              if (msg.role === 'assistant') prompt += "Assistant: ";
              
              if (typeof msg.content === 'string') {
                prompt += msg.content + "\n\n";
              } else if (Array.isArray(msg.content)) {
                for (const part of msg.content) {
                  if (part.type === 'text') {
                    prompt += part.content + "\n\n";
                  } else if (part.type === 'image') {
                    imageUrl = await toURL(part.content);
                  }
                }
              }
            }
          }

          let extended_thinking = undefined;
          let thinking_budget_tokens = undefined;
          if (request.reason) {
            extended_thinking = true;
            if (request.reason.maxTokens) {
              thinking_budget_tokens = request.reason.maxTokens;
            }
          }

          return {
            prompt: prompt.trim(),
            system_prompt: systemPrompt.trim() || undefined,
            image: imageUrl,
            max_tokens: request.maxTokens,
            extended_thinking,
            thinking_budget_tokens,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          content: response.join(''),
          finishReason: 'stop',
          model: 'anthropic/claude-4-sonnet'
        }),
        parseChunk: async (chunk: string, ctx) => ({
          content: chunk,
        })
      },
    };
    return transformer;
  })(),
}