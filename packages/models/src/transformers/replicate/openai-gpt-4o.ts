import { toURL, toText } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    top_p?: number;
    prompt?: string | null;
    messages?: Record<string, never>[];
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
  "openai/gpt-4o": (() => {
    const transformer: ReplicateTransformer = {
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const image_input: string[] = [];
          const messages: any[] = [];

          for (const msg of request.messages) {
            if (typeof msg.content === 'string') {
              messages.push({ role: msg.role, content: msg.content });
            } else {
              const textParts: string[] = [];
              for (const part of msg.content) {
                if (part.type === 'text') {
                  textParts.push(await toText(part.content));
                } else if (part.type === 'image') {
                  image_input.push(await toURL(part.content));
                }
              }
              messages.push({ role: msg.role, content: textParts.join('\n') });
            }
          }

          return {
            messages,
            image_input,
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
        parseChunk: async (chunk: any, ctx) => {
          return {
            content: typeof chunk === 'string' ? chunk : '',
          };
        },
      },
    };
    return transformer;
  })(),
}