import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    width?: Schemas["width"];
    height?: Schemas["height"];
    prompt?: string;
    scheduler?: Schemas["scheduler"];
    num_outputs?: number;
    guidance_scale?: number;
    negative_prompt?: string;
    num_inference_steps?: number;
  };
  width: 64 | 128 | 192 | 256 | 320 | 384 | 448 | 512 | 576 | 640 | 704 | 768 | 832 | 896 | 960 | 1024;
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  height: 64 | 128 | 192 | 256 | 320 | 384 | 448 | 512 | 576 | 640 | 704 | 768 | 832 | 896 | 960 | 1024;
  scheduler: "DDIM" | "K_EULER" | "DPMSolverMultistep" | "K_EULER_ANCESTRAL" | "PNDM" | "KLMS";
};

export default {
  "stability-ai/stable-diffusion": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let width: Schemas["width"] | undefined;
          let height: Schemas["height"] | undefined;
          if (request.size) {
            const parts = request.size.split('x').map(Number);
            if (parts.length === 2) {
              width = parts[0] as Schemas["width"];
              height = parts[1] as Schemas["height"];
            }
          }

          return {
            prompt: request.prompt,
            num_outputs: request.n,
            seed: request.seed,
            width,
            height,
            ...request.extra,
          };
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