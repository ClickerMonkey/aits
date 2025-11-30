import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    hdr?: number;
    mask?: string;
    seed?: number;
    image?: string;
    steps?: number;
    prompt?: string;
    scheduler?: Schemas["scheduler"];
    creativity?: number;
    guess_mode?: boolean;
    resolution?: Schemas["resolution"];
    resemblance?: number;
    guidance_scale?: number;
    negative_prompt?: string;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  scheduler: "DDIM" | "DPMSolverMultistep" | "K_EULER_ANCESTRAL" | "K_EULER";
  resolution: "original" | "1024" | "2048";
};

export default {
  "fermatresearch/magic-image-refiner": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((url) => ({ url })),
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          image: await toURL(request.image),
          mask: request.mask ? await toURL(request.mask) : undefined,
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((url) => ({ url })),
        }),
      },
    };
    return transformer;
  })(),
}