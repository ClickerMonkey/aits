import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    upscale?: Schemas["upscale"];
  };
  Output: string;
  Status: "processing" | "succeeded" | "canceled" | "failed";
  upscale: 2 | 4 | 8;
};

export default {
  "cjwbw/real-esrgan": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          upscale: request.extra?.upscale,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })()
}