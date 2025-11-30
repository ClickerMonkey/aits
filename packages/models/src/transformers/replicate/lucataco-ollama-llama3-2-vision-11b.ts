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
  "lucataco/ollama-llama3.2-vision-11b": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.images[0]),
          prompt: request.prompt,
          max_tokens: request.maxTokens,
          temperature: request.temperature,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          content: response.join(""),
          finishReason: "stop",
        }),
        parseChunk: async (chunk: any, ctx) => ({
          content: chunk,
        }),
      },
    };
    return transformer;
  })(),
}