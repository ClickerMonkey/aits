import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    top_p?: number;
    prompt: string;
    max_tokens?: number;
    temperature?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "lucataco/ollama-llama3.2-vision-90b": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx) => {
          const image = request.images && request.images.length > 0 ? request.images[0] : undefined;
          if (!image) throw new Error("Image is required for this model");
          return {
            prompt: request.prompt,
            image: await toURL(image),
            max_tokens: request.maxTokens,
            temperature: request.temperature,
            ...request.extra,
          };
        },
        parseResponse: async (response, ctx) => {
          return {
            content: Array.isArray(response) ? response.join('') : String(response),
            finishReason: 'stop',
            model: "lucataco/ollama-llama3.2-vision-90b"
          };
        },
        parseChunk: async (chunk, ctx) => {
          return {
            content: String(chunk),
            model: "lucataco/ollama-llama3.2-vision-90b"
          };
        }
      }
    };
    return transformer;
  })(),
}