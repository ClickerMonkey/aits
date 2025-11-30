import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    image?: string;
    width?: number;
    height?: number;
    prompt?: string;
    num_images?: number;
    control_image?: string;
    guidance_scale?: number;
    archive_outputs?: boolean;
    prompt_strength?: number;
    sizing_strategy?: Schemas["sizing_strategy"];
    lcm_origin_steps?: number;
    canny_low_threshold?: number;
    num_inference_steps?: number;
    canny_high_threshold?: number;
    control_guidance_end?: number;
    control_guidance_start?: number;
    disable_safety_checker?: boolean;
    controlnet_conditioning_scale?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  sizing_strategy: "width/height" | "input_image" | "control_image";
};

export default {
  "fofr/latent-consistency-model": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: Schemas["Input"] = {
            prompt: request.prompt,
            num_images: request.n,
            seed: request.seed,
            ...request.extra,
          };
          if (request.size) {
            const [width, height] = request.size.split("x").map(Number);
            input.width = width;
            input.height = height;
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
            num_images: request.n,
            seed: request.seed,
            ...request.extra,
          };
          if (request.size) {
            const [width, height] = request.size.split("x").map(Number);
            input.width = width;
            input.height = height;
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
  })()
}