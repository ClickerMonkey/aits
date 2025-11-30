import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    prompt: string;
    num_images?: number;
    image_width?: number;
    image_height?: number;
    output_format?: Schemas["output_format"];
    guidance_scale?: number;
    output_quality?: number;
    num_inference_steps?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  output_format: "png" | "jpg" | "webp";
};

export default {
  "prunaai/sdxl-lightning": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let width = 1024;
          let height = 1024;
          if (request.size) {
            const parts = request.size.split('x');
            if (parts.length === 2) {
              width = parseInt(parts[0], 10);
              height = parseInt(parts[1], 10);
            }
          }
          return {
            prompt: request.prompt,
            num_images: request.n,
            seed: request.seed,
            image_width: width,
            image_height: height,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: [{ url: await toURL(response) }],
          };
        },
      },
    };
    return transformer;
  })(),
}