import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    hdr?: number;
    seed?: number;
    image?: string;
    steps?: number;
    format?: Schemas["format"];
    prompt?: string;
    scheduler?: Schemas["scheduler"];
    creativity?: number;
    guess_mode?: boolean;
    resolution?: Schemas["resolution"];
    resemblance?: number;
    guidance_scale?: number;
    negative_prompt?: string;
    lora_details_strength?: number;
    lora_sharpness_strength?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  format: "jpg" | "png";
  scheduler: "DDIM" | "DPMSolverMultistep" | "K_EULER_ANCESTRAL" | "K_EULER";
  resolution: 2048 | 2560 | 4096;
};

export default {
  "fermatresearch/high-resolution-controlnet-tile": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          image: await toURL(request.image),
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}