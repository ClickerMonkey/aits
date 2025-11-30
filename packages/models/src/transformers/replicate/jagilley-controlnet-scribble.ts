import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    eta?: number;
    seed?: number;
    image: string;
    scale?: number;
    prompt: string;
    a_prompt?: string;
    n_prompt?: string;
    ddim_steps?: number;
    num_samples?: Schemas["num_samples"];
    image_resolution?: Schemas["image_resolution"];
  };
  Output: string[];
  Status: "processing" | "succeeded" | "canceled" | "failed";
  num_samples: "1" | "4";
  image_resolution: "256" | "512" | "768";
};

export default {
  "jagilley/controlnet-scribble": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          image: await toURL(request.image),
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