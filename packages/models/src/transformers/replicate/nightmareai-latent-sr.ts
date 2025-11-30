import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  up_f: 2 | 3 | 4;
  Input: {
    up_f?: Schemas["up_f"];
    image: string;
    steps?: number;
  };
  Output: string;
  Status: "processing" | "succeeded" | "failed";
  Request: {
    input?: Schemas["Input"];
    output_file_prefix?: string;
  };
  Response: {
    error?: string;
    output?: Schemas["Output"];
    status: Schemas["Status"];
  };
};

export default {
  "nightmareai/latent-sr": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          up_f: request.extra?.up_f,
          steps: request.extra?.steps,
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