import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    prompt?: string;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "lucataco/llama-3-vision-alpha": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.images[0]),
          prompt: request.prompt,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          content: response.join(""),
          finishReason: "stop",
        }),
        parseChunk: async (chunk: string, ctx) => ({
          content: chunk,
        }),
      },
    };
    return transformer;
  })(),
}