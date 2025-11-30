import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    scale_factor?: Schemas["scale_factor"];
    max_batch_size?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  scale_factor: 2 | 4 | 8 | 16 | 32;
};

export default {
  "zsxkib/aura-sr": (() => {
    const transformer: ReplicateTransformer = { 
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({ 
          image: await toURL(request.image),
          scale_factor: request.extra?.scale_factor,
          max_batch_size: request.extra?.max_batch_size,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })()
}