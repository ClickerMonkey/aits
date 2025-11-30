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
  scheduler: "DDIM" | "DPMSolverMultistep" | "HeunDiscrete" | "KarrasDPM" | "K_EULER_ANCESTRAL" | "K_EULER" | "PNDM" | "DPM++2MSDE";
};

export default {
  "datacte/proteus-v0.3": (() => {
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
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map(url => ({ url })),
        }),
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
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map(url => ({ url })),
        }),
      },
    };
    return transformer;
  })(),
}