import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    image?: string;
    prompt?: string;
    ip_image?: string;
    ip_scale?: number;
    strength?: number;
    scheduler?: Schemas["scheduler"];
    lora_scale?: number;
    num_outputs?: number;
    lora_weights?: string;
    guidance_scale?: number;
    resizing_scale?: number;
    apply_watermark?: boolean;
    negative_prompt?: string;
    background_color?: string;
    num_inference_steps?: number;
    condition_canny_scale?: number;
    condition_depth_scale?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  scheduler: "DDIM" | "DPMSolverMultistep" | "HeunDiscrete" | "KarrasDPM" | "K_EULER_ANCESTRAL" | "K_EULER" | "PNDM";
};

export default {
  "fermatresearch/magic-style-transfer": (() => {
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
          image: await toURL(request.image),
          prompt: request.prompt,
          num_outputs: request.n,
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