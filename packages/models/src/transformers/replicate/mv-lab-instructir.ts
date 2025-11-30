import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    image: string;
    prompt: string;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "mv-lab/instructir": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          image: await toURL(request.image),
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}