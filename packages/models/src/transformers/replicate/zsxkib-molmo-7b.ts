import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    text: string;
    image: string;
    top_k?: number;
    top_p?: number;
    temperature?: number;
    length_penalty?: number;
    max_new_tokens?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "zsxkib/molmo-7b": (() => {
    type Schemas = {
      Input: {
        text: string;
        image: string;
        top_k?: number;
        top_p?: number;
        temperature?: number;
        length_penalty?: number;
        max_new_tokens?: number;
      };
      Output: string;
      Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
    };

    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          return {
            text: request.prompt,
            image: await toURL(request.images[0]),
            max_new_tokens: request.maxTokens,
            temperature: request.temperature,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            content: response,
            finishReason: "stop",
          };
        },
      },
    };
    return transformer;
  })(),
}