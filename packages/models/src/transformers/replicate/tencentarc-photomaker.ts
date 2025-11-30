import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    prompt?: string;
    num_steps?: number;
    style_name?: Schemas["style_name"];
    input_image: string;
    num_outputs?: number;
    input_image2?: string;
    input_image3?: string;
    input_image4?: string;
    guidance_scale?: number;
    negative_prompt?: string;
    style_strength_ratio?: number;
    disable_safety_checker?: boolean;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  style_name: "(No style)" | "Cinematic" | "Disney Charactor" | "Digital Art" | "Photographic (Default)" | "Fantasy art" | "Neonpunk" | "Enhance" | "Comic book" | "Lowpoly" | "Line art";
};

export default {
  "tencentarc/photomaker": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const extra = request.extra || {};
          return {
            prompt: request.prompt,
            input_image: extra.input_image,
            num_outputs: request.n,
            seed: request.seed,
            style_name: extra.style_name,
            num_steps: extra.num_steps,
            guidance_scale: extra.guidance_scale,
            negative_prompt: extra.negative_prompt,
            style_strength_ratio: extra.style_strength_ratio,
            disable_safety_checker: extra.disable_safety_checker,
            input_image2: extra.input_image2,
            input_image3: extra.input_image3,
            input_image4: extra.input_image4,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: response.map((url) => ({ url })),
          };
        },
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const extra = request.extra || {};
          return {
            prompt: request.prompt,
            input_image: await toURL(request.image),
            num_outputs: request.n,
            seed: request.seed,
            style_name: extra.style_name,
            num_steps: extra.num_steps,
            guidance_scale: extra.guidance_scale,
            negative_prompt: extra.negative_prompt,
            style_strength_ratio: extra.style_strength_ratio,
            disable_safety_checker: extra.disable_safety_checker,
            input_image2: extra.input_image2,
            input_image3: extra.input_image3,
            input_image4: extra.input_image4,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: response.map((url) => ({ url })),
          };
        },
      },
    };
    return transformer;
  })()
}