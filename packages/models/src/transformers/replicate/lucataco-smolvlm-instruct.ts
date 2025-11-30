import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    prompt?: string;
    max_new_tokens?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "lucataco/smolvlm-instruct": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const image = request.images?.[0];
          if (!image) throw new Error("An image is required for this model");

          return {
            image: await toURL(image),
            prompt: request.prompt,
            max_new_tokens: request.maxTokens,
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