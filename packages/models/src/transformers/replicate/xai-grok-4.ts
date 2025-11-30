import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    top_p?: number;
    prompt?: string;
    max_tokens?: number;
    temperature?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "xai/grok-4": (() => {
    const transformer: ReplicateTransformer = {
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const prompt = request.messages.map(m => {
            if (typeof m.content === 'string') return `${m.role}: ${m.content}`;
            return `${m.role}: ${m.content.filter(c => c.type === 'text').map(c => c.content).join('')}`;
          }).join('\n\n');

          return {
            prompt,
            max_tokens: request.maxTokens,
            temperature: request.temperature,
            top_p: request.topP,
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