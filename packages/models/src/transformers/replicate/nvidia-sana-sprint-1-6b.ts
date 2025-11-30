import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    width?: number;
    height?: number;
    prompt?: string;
    output_format?: Schemas["output_format"];
    guidance_scale?: number;
    output_quality?: number;
    inference_steps?: number;
    intermediate_timesteps?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  output_format: "webp" | "jpg" | "png";
};

export default {
  "nvidia/sana-sprint-1.6b": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let width: number | undefined;
          let height: number | undefined;
          if (request.size) {
            const parts = request.size.split('x').map(Number);
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              width = parts[0];
              height = parts[1];
            }
          }
          return {
            prompt: request.prompt,
            seed: request.seed,
            width,
            height,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}