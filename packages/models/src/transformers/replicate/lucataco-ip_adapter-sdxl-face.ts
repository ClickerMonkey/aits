import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    image: string;
    scale?: number;
    prompt?: string;
    num_outputs?: number;
    negative_prompt?: string;
    num_inference_steps?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "lucataco/ip_adapter-sdxl-face": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          prompt: request.prompt,
          num_outputs: request.n,
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((url) => ({ url })),
        }),
      },
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          if (!request.extra?.image) {
            throw new Error("Model requires 'image' in extra parameters");
          }
          return {
            prompt: request.prompt,
            image: await toURL(request.extra.image),
            num_outputs: request.n,
            seed: request.seed,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((url) => ({ url })),
        }),
      },
    };
    return transformer;
  })(),
}