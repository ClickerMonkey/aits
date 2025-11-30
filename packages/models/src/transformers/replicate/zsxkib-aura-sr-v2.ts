import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    output_format?: Schemas["output_format"];
    max_batch_size?: number;
    output_quality?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  output_format: "webp" | "jpg" | "png";
};

export default { 
  "zsxkib/aura-sr-v2": (() => {
    const transformer: ReplicateTransformer = { 
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({ 
          image: await toURL(request.image),
          output_format: request.extra?.output_format,
          max_batch_size: request.extra?.max_batch_size,
          output_quality: request.extra?.output_quality,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(), 
}