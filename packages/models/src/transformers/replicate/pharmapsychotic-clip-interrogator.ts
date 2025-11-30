import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  mode: "best" | "classic" | "fast" | "negative";
  Input: {
    mode?: Schemas["mode"];
    image: string;
    clip_model_name?: Schemas["clip_model_name"];
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  clip_model_name: "ViT-L-14/openai" | "ViT-H-14/laion2b_s32b_b79k" | "ViT-bigG-14/laion2b_s39b_b160k";
};

export default {
  "pharmapsychotic/clip-interrogator": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const image = request.images[0];
          if (!image) throw new Error("No image provided");
          return {
            image: await toURL(image),
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