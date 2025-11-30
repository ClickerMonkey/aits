import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    juiced?: boolean;
    prompt: string;
    megapixels?: Schemas["megapixels"];
    aspect_ratio?: Schemas["aspect_ratio"];
    output_format?: Schemas["output_format"];
    output_quality?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  megapixels: 1 | 2;
  aspect_ratio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "21:9";
  output_format: "png" | "jpg" | "webp";
};

export default {
  "prunaai/wan-2.2-image": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
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