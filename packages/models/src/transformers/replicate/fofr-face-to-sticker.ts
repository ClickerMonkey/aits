import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    image?: string;
    steps?: number;
    width?: number;
    height?: number;
    prompt?: string;
    upscale?: boolean;
    upscale_steps?: number;
    negative_prompt?: string;
    prompt_strength?: number;
    ip_adapter_noise?: number;
    ip_adapter_weight?: number;
    instant_id_strength?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "fofr/face-to-sticker": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          prompt: request.prompt,
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