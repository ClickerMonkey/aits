import { toURL, toText } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    top_p?: number;
    prompt?: string | null;
    messages?: Record<string, any>[];
    image_input?: string[];
    temperature?: number;
    system_prompt?: string | null;
    presence_penalty?: number;
    frequency_penalty?: number;
    max_completion_tokens?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "openai/gpt-4o-mini": (() => {
    const transformer: ReplicateTransformer = {
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const messages = await Promise.all(request.messages.map(async (m) => {
            let content: any = m.content;
            if (Array.isArray(m.content)) {
              content = await Promise.all(m.content.map(async (c) => {
                if (c.type === 'image') {
                  return {
                    type: 'image_url',
                    image_url: { url: await toURL(c.content) }
                  };
                }
                if (c.type === 'text') {
                  return { type: 'text', text: await toText(c.content) };
                }
                return null;
              }));
              content = content.filter((c: any) => c !== null);
            }
            return {
              role: m.role,
              content,
            };
          }));

          return {
            messages,
            top_p: request.topP,
            temperature: request.temperature,
            max_completion_tokens: request.maxTokens,
            presence_penalty: request.presencePenalty,
            frequency_penalty: request.frequencyPenalty,
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