import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
  };
  Output: unknown;
  Status: "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "nohamoamary/image-captioning-with-visual-attention": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.images[0]),
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => {
          const output = response as Array<{ text: string }>;
          return {
            content: output?.[0]?.text ?? "",
            finishReason: "stop",
          };
        },
      },
    };
    return transformer;
  })(),
}