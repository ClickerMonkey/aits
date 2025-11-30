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
  "openai/gpt-4.1-mini": (() => {
    const transformer: ReplicateTransformer = { 
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const messages = [];
          const images: string[] = [];

          for (const m of request.messages) {
            let content = "";
            if (typeof m.content === 'string') {
              content = m.content;
            } else {
              for (const part of m.content) {
                if (part.type === 'image') {
                  images.push(await toURL(part.content));
                } else if (part.type === 'text') {
                  content += await toText(part.content);
                }
              }
            }
            messages.push({ role: m.role, content });
          }

          return { 
            messages,
            image_input: images.length > 0 ? images : undefined,
            top_p: request.topP,
            temperature: request.temperature,
            max_completion_tokens: request.maxTokens,
            frequency_penalty: request.frequencyPenalty,
            presence_penalty: request.presencePenalty,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          content: response.join(''),
          finishReason: 'stop',
        }),
        parseChunk: async (chunk: any, ctx) => ({
          content: chunk,
        }),
      },
    };
    return transformer;
  })(),
}