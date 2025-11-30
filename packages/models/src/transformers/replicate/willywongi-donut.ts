import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
  };
  Output: string;
  Status: "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "willywongi/donut": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.images[0]),
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          content: response,
          finishReason: "stop",
        }),
      },
    };
    return transformer;
  })(),
}