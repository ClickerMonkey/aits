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
    refine?: Schemas["refine"];
    scheduler?: Schemas["scheduler"];
    lora_scale?: number;
    num_outputs?: number;
    controlnet_1?: Schemas["controlnet_1"];
    controlnet_2?: Schemas["controlnet_2"];
    controlnet_3?: Schemas["controlnet_3"];
    lora_weights?: string;
    refine_steps?: number;
    guidance_scale?: number;
    apply_watermark?: boolean;
    negative_prompt?: string;
    prompt_strength?: number;
    sizing_strategy?: Schemas["sizing_strategy"];
    controlnet_1_end?: number;
    controlnet_2_end?: number;
    controlnet_3_end?: number;
    controlnet_1_image?: string;
    controlnet_1_start?: number;
    controlnet_2_image?: string;
    controlnet_2_start?: number;
    controlnet_3_image?: string;
    controlnet_3_start?: number;
    num_inference_steps?: number;
    disable_safety_checker?: boolean;
    controlnet_1_conditioning_scale?: number;
    controlnet_2_conditioning_scale?: number;
    controlnet_3_conditioning_scale?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  refine: "no_refiner" | "base_image_refiner";
  scheduler: "DDIM" | "DPMSolverMultistep" | "HeunDiscrete" | "KarrasDPM" | "K_EULER_ANCESTRAL" | "K_EULER" | "PNDM";
  controlnet_1: "none" | "edge_canny" | "illusion" | "depth_leres" | "depth_midas" | "soft_edge_pidi" | "soft_edge_hed" | "lineart" | "lineart_anime" | "openpose";
  controlnet_2: "none" | "edge_canny" | "illusion" | "depth_leres" | "depth_midas" | "soft_edge_pidi" | "soft_edge_hed" | "lineart" | "lineart_anime" | "openpose";
  controlnet_3: "none" | "edge_canny" | "illusion" | "depth_leres" | "depth_midas" | "soft_edge_pidi" | "soft_edge_hed" | "lineart" | "lineart_anime" | "openpose";
  sizing_strategy: "width_height" | "input_image" | "controlnet_1_image" | "controlnet_2_image" | "controlnet_3_image" | "mask_image";
};

export default { 
  "sdxl-based/realvisxl-v3-multi-controlnet-lora": (() => {
    const transformer: ReplicateTransformer = { 
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const [width, height] = request.size ? request.size.split('x').map(Number) : [undefined, undefined];
          return { 
            prompt: request.prompt,
            width,
            height,
            num_outputs: request.n,
            seed: request.seed,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const [width, height] = request.size ? request.size.split('x').map(Number) : [undefined, undefined];
          return {
            prompt: request.prompt,
            image: await toURL(request.image),
            mask: request.mask ? await toURL(request.mask) : undefined,
            width,
            height,
            num_outputs: request.n,
            seed: request.seed,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
    };
    return transformer;
  })(), 
}