import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    mask?: string;
    seed?: number;
    image: string;
    prompt?: string;
    dynamic?: number;
    handfix?: Schemas["handfix"];
    pattern?: boolean;
    sharpen?: number;
    sd_model?: Schemas["sd_model"];
    scheduler?: Schemas["scheduler"];
    creativity?: number;
    lora_links?: string;
    downscaling?: boolean;
    resemblance?: number;
    scale_factor?: number;
    tiling_width?: Schemas["tiling_width"];
    output_format?: Schemas["output_format"];
    tiling_height?: Schemas["tiling_height"];
    custom_sd_model?: string;
    negative_prompt?: string;
    num_inference_steps?: number;
    downscaling_resolution?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  handfix: "disabled" | "hands_only" | "image_and_hands";
  sd_model: "epicrealism_naturalSinRC1VAE.safetensors [84d76a0328]" | "juggernaut_reborn.safetensors [338b85bc4f]" | "flat2DAnimerge_v45Sharp.safetensors";
  scheduler: "DPM++ 2M Karras" | "DPM++ SDE Karras" | "DPM++ 2M SDE Exponential" | "DPM++ 2M SDE Karras" | "Euler a" | "Euler" | "LMS" | "Heun" | "DPM2" | "DPM2 a" | "DPM++ 2S a" | "DPM++ 2M" | "DPM++ SDE" | "DPM++ 2M SDE" | "DPM++ 2M SDE Heun" | "DPM++ 2M SDE Heun Karras" | "DPM++ 2M SDE Heun Exponential" | "DPM++ 3M SDE" | "DPM++ 3M SDE Karras" | "DPM++ 3M SDE Exponential" | "DPM fast" | "DPM adaptive" | "LMS Karras" | "DPM2 Karras" | "DPM2 a Karras" | "DPM++ 2S a Karras" | "Restart" | "DDIM" | "PLMS" | "UniPC";
  tiling_width: 16 | 32 | 48 | 64 | 80 | 96 | 112 | 128 | 144 | 160 | 176 | 192 | 208 | 224 | 240 | 256;
  output_format: "webp" | "jpg" | "png";
  tiling_height: 16 | 32 | 48 | 64 | 80 | 96 | 112 | 128 | 144 | 160 | 176 | 192 | 208 | 224 | 240 | 256;
};

export default { 
  "philz1337x/clarity-upscaler": (() => {
    const transformer: ReplicateTransformer = { 
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          mask: request.mask ? await toURL(request.mask) : undefined,
          prompt: request.prompt,
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
    };
    return transformer;
  })(), 
}