import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    image: string;
    cfg_scale?: number;
    user_prompt?: string;
    sample_times?: number;
    scale_factor?: number;
    negative_prompt?: string;
    positive_prompt?: string;
    latent_tiled_size?: number;
    num_inference_steps?: number;
    latent_tiled_overlap?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "cswry/seesr": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          user_prompt: request.prompt,
          sample_times: request.n,
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