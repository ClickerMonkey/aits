import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    image?: string;
    prompt?: string;
    refine?: Schemas["refine"];
    img2img?: boolean;
    strength?: number;
    scheduler?: Schemas["scheduler"];
    lora_scale?: number;
    num_outputs?: number;
    lora_weights?: string;
    refine_steps?: number;
    guidance_scale?: number;
    apply_watermark?: boolean;
    condition_scale?: number;
    negative_prompt?: string;
    num_inference_steps?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  refine: "no_refiner" | "base_image_refiner";
  scheduler: "DDIM" | "DPMSolverMultistep" | "HeunDiscrete" | "KarrasDPM" | "K_EULER_ANCESTRAL" | "K_EULER" | "PNDM";
};

export default {
  "fermatresearch/sdxl-controlnet-lora": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          num_outputs: request.n,
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
          num_outputs: request.n,
          seed: request.seed,
          img2img: true,
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