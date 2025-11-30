import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    image: string;
    scale?: Schemas["scale"];
    sigma?: number;
    prompt?: string;
    stride?: number;
    auto_prompt?: boolean;
    multi_decoder?: boolean;
    cosine_scale_1?: number;
    cosine_scale_2?: number;
    cosine_scale_3?: number;
    guidance_scale?: number;
    negative_prompt?: string;
    view_batch_size?: number;
    num_inference_steps?: number;
  };
  scale: 1 | 2 | 4;
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "lucataco/demofusion-enhance": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          prompt: request.prompt,
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: response }],
        }),
      },
    };
    return transformer;
  })(),
}