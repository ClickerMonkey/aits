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
    lora_scale?: number;
    num_outputs?: number;
    refine_steps?: number;
    guidance_scale?: number;
    apply_watermark?: boolean;
    high_noise_frac?: number;
    negative_prompt?: string;
    prompt_strength?: number;
    replicate_weights?: string;
    num_inference_steps?: number;
    disable_safety_checker?: boolean;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  refine: "no_refiner" | "expert_ensemble_refiner" | "base_image_refiner";
  scheduler: "DDIM" | "DPMSolverMultistep" | "HeunDiscrete" | "KarrasDPM" | "K_EULER_ANCESTRAL" | "K_EULER" | "PNDM";
};

export default {
  "fofr/sdxl-emoji": (() => {
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
            const [width, height] = request.size.split('x').map(Number);
            if (!isNaN(width) && !isNaN(height)) {
              input.width = width;
              input.height = height;
            }
          }

          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
          };
        },
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: Schemas["Input"] = {
            prompt: request.prompt,
            image: await toURL(request.image),
            num_outputs: request.n,
            seed: request.seed,
            ...request.extra,
          };

          if (request.mask) {
            input.mask = await toURL(request.mask);
          }

          if (request.size) {
            const [width, height] = request.size.split('x').map(Number);
            if (!isNaN(width) && !isNaN(height)) {
              input.width = width;
              input.height = height;
            }
          }

          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
          };
        },
      },
    };
    return transformer;
  })(),
}