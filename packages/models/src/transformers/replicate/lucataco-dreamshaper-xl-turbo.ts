import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    width?: number;
    height?: number;
    prompt?: string;
    scheduler?: Schemas["scheduler"];
    num_outputs?: number;
    guidance_scale?: number;
    apply_watermark?: boolean;
    negative_prompt?: string;
    num_inference_steps?: number;
    disable_safety_checker?: boolean;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  scheduler: "DDIM" | "DPMSolverMultistep" | "HeunDiscrete" | "KarrasDPM" | "K_EULER_ANCESTRAL" | "K_EULER" | "PNDM";
};

export default {
  "lucataco/dreamshaper-xl-turbo": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: Schemas["Input"] = {
            prompt: request.prompt,
            num_outputs: request.n,
            seed: request.seed,
            ...request.extra,
          };

          if (request.size) {
            const [width, height] = request.size.split("x").map(Number);
            if (!isNaN(width) && !isNaN(height)) {
              input.width = width;
              input.height = height;
            }
          }

          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: await Promise.all(response.map(async (url) => ({
              url: await toURL(url),
            }))),
          };
        },
      },
    };
    return transformer;
  })(),
}