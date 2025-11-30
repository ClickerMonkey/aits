import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    steps?: number;
    width?: number;
    height?: number;
    prompt?: string;
    guidance?: number;
    scheduler?: Schemas["scheduler"];
    negative_prompt?: string;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  scheduler: "EulerA" | "MultistepDPM-Solver";
};

export default {
  "lucataco/realistic-vision-v5.1": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let width = 512;
          let height = 728;
          if (request.size) {
            const parts = request.size.split('x').map(Number);
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              width = parts[0];
              height = parts[1];
            }
          }
          return {
            prompt: request.prompt,
            width,
            height,
            seed: request.seed,
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