import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    steps?: number;
    width?: number;
    height?: number;
    prompt?: string;
    output_format?: Schemas["output_format"];
    output_quality?: number;
    negative_prompt?: string;
    number_of_images?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  output_format: "webp" | "jpg" | "png";
};

export default {
  "fofr/sticker-maker": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let width: number | undefined;
          let height: number | undefined;
          if (request.size) {
            const parts = request.size.split('x');
            if (parts.length === 2) {
              const w = parseInt(parts[0]);
              const h = parseInt(parts[1]);
              if (!isNaN(w) && !isNaN(h)) {
                width = w;
                height = h;
              }
            }
          }
          return {
            prompt: request.prompt,
            number_of_images: request.n,
            seed: request.seed,
            width,
            height,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
    };
    return transformer;
  })(),
}