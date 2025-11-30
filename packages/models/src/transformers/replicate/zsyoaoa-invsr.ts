import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    in_path: string;
    num_steps?: Schemas["num_steps"];
    chopping_size?: Schemas["chopping_size"];
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  num_steps: 1 | 2 | 3 | 4 | 5;
  chopping_size: 128 | 256 | 512;
};

export default {
  "zsyoaoa/invsr": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          in_path: await toURL(request.image),
          seed: request.seed,
          num_steps: request.extra?.num_steps,
          chopping_size: request.extra?.chopping_size,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}