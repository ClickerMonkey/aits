import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    mask?: string;
    seed?: number;
    image?: string;
    width?: number;
    height?: number;
    prompt?: string;
    scheduler?: Schemas["scheduler"];
    num_outputs?: number;
    guidance_scale?: number;
    apply_watermark?: boolean;
    negative_prompt?: string;
    prompt_strength?: number;
    num_inference_steps?: number;
    disable_safety_checker?: boolean;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  scheduler: "DDIM" | "DPMSolverMultistep" | "HeunDiscrete" | "KarrasDPM" | "K_EULER_ANCESTRAL" | "K_EULER" | "PNDM";
};

export default {
  "lucataco/open-dalle-v1.1": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let width = 1024;
          let height = 1024;
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
            num_outputs: request.n,
            seed: request.seed,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((url) => ({ url })),
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let width = 1024;
          let height = 1024;
          if (request.size) {
            const parts = request.size.split('x').map(Number);
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              width = parts[0];
              height = parts[1];
            }
          }
          return {
            prompt: request.prompt,
            image: await toURL(request.image),
            mask: request.mask ? await toURL(request.mask) : undefined,
            width,
            height,
            num_outputs: request.n,
            seed: request.seed,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((url) => ({ url })),
        }),
      },
    };
    return transformer;
  })(),
}