import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    image: string;
    scale?: Schemas["scale"];
    strength?: number;
    num_inference_steps?: number;
  };
  scale: 2 | 4 | 8 | 16;
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "lucataco/controlnet-tile": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          seed: request.seed,
          scale: request.extra?.scale,
          strength: request.extra?.strength,
          num_inference_steps: request.extra?.num_inference_steps,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })()
}