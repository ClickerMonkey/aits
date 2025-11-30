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
    refine?: Schemas["refine"];
    scheduler?: Schemas["scheduler"];
    num_outputs?: number;
    refine_steps?: number;
    guidance_scale?: number;
    apply_watermark?: boolean;
    high_noise_frac?: number;
    negative_prompt?: string;
    prompt_strength?: number;
    num_inference_steps?: number;
    disable_safety_checker?: boolean;
  };
  Output: string[];
  refine: "no_refiner" | "expert_ensemble_refiner" | "base_image_refiner";
  scheduler: "DDIM" | "DPMSolverMultistep" | "HeunDiscrete" | "KarrasDPM" | "K_EULER_ANCESTRAL" | "K_EULER" | "PNDM" | "DPM++_SDE_Karras";
};

export default {
  "adirik/realvisxl-v3.0-turbo": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let width = 768;
          let height = 768;
          if (request.size) {
            const parts = request.size.split('x');
            if (parts.length === 2) {
              width = parseInt(parts[0]);
              height = parseInt(parts[1]);
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
          images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let width = 768;
          let height = 768;
          if (request.size) {
            const parts = request.size.split('x');
            if (parts.length === 2) {
              width = parseInt(parts[0]);
              height = parseInt(parts[1]);
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
          images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
    };
    return transformer;
  })(),
}