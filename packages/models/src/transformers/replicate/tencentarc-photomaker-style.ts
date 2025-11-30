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
  "tencentarc/photomaker-style": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          num_outputs: request.n,
          seed: request.seed,
          ...request.extra,
        } as Schemas["Input"]),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          input_image: await toURL(request.image),
          num_outputs: request.n,
          seed: request.seed,
          ...request.extra,
        } as Schemas["Input"]),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
    };
    return transformer;
  })(),
}