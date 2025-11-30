import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    width?: number;
    height?: number;
    prompt?: string;
    model_variant?: Schemas["model_variant"];
    guidance_scale?: number;
    negative_prompt?: string;
    pag_guidance_scale?: number;
    num_inference_steps?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  model_variant: "1600M-1024px" | "1600M-1024px-multilang" | "1600M-512px" | "600M-1024px-multilang" | "600M-512px-multilang";
};

export default {
  "nvidia/sana": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let width = request.extra?.width;
          let height = request.extra?.height;

          if (request.size) {
            const parts = request.size.split('x');
            if (parts.length === 2) {
              const w = parseInt(parts[0]);
              const h = parseInt(parts[1]);
              if (!isNaN(w) && !isNaN(h)) {
                width = w;
                height = h;
              }
            }
          }

          return {
            prompt: request.prompt,
            width,
            height,
            seed: request.seed,
            negative_prompt: request.extra?.negative_prompt,
            model_variant: request.extra?.model_variant,
            guidance_scale: request.extra?.guidance_scale,
            pag_guidance_scale: request.extra?.pag_guidance_scale,
            num_inference_steps: request.extra?.num_inference_steps,
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