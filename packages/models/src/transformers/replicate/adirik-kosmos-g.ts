import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    image1: string;
    image2?: string;
    prompt?: string;
    num_images?: number;
    negative_prompt?: string;
    num_inference_steps?: number;
    text_guidance_scale?: number;
  };
  Output: string[];
};

export default {
  "adirik/kosmos-g": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          num_images: request.n,
          seed: request.seed,
          image1: request.extra?.image1, // Required by model, expected in extra for generate
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((url) => ({ url })),
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          image1: await toURL(request.image),
          num_images: request.n,
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((url) => ({ url })),
        }),
      },
    };
    return transformer;
  })(),
}