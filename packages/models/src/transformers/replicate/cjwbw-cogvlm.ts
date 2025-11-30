import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    vqa?: boolean;
    image: string;
    query?: string;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "cjwbw/cogvlm": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const image = request.images?.[0];
          if (!image) throw new Error("Image is required for this model");
          return {
            image: await toURL(image),
            query: request.prompt,
            vqa: request.extra?.vqa ?? true,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          content: response,
          finishReason: "stop",
          model: "cjwbw/cogvlm",
        }),
      },
    };
    return transformer;
  })()
}