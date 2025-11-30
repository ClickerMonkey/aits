import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    cfg?: number;
    seed?: number;
    image: string;
    steps?: number;
    denoise?: number;
    upscaler?: Schemas["upscaler"];
    mask_blur?: number;
    mode_type?: Schemas["mode_type"];
    scheduler?: Schemas["scheduler"];
    tile_width?: number;
    upscale_by?: number;
    tile_height?: number;
    sampler_name?: Schemas["sampler_name"];
    tile_padding?: number;
    seam_fix_mode?: Schemas["seam_fix_mode"];
    seam_fix_width?: number;
    negative_prompt?: string;
    positive_prompt?: string;
    seam_fix_denoise?: number;
    seam_fix_padding?: number;
    seam_fix_mask_blur?: number;
    controlnet_strength?: number;
    force_uniform_tiles?: boolean;
    use_controlnet_tile?: boolean;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  upscaler: "4x_NMKD-Siax_200k" | "4x-UltraSharp" | "RealESRGAN_x4plus" | "RealESRGAN_x4plus_anime_6B";
  mode_type: "Linear" | "Chess" | "None";
  scheduler: "normal" | "karras" | "exponential" | "sgm_uniform" | "simple" | "ddim_uniform";
  sampler_name: "euler" | "euler_ancestral" | "heun" | "dpm_2" | "dpm_2_ancestral" | "lms" | "dpm_fast" | "dpm_adaptive" | "dpmpp_2s_ancestral" | "dpmpp_sde" | "dpmpp_sde_gpu" | "dpmpp_2m" | "dpmpp_2m_sde" | "dpmpp_2m_sde_gpu" | "dpmpp_3m_sde" | "dpmpp_3m_sde_gpu" | "dpmpp" | "ddim" | "uni_pc" | "uni_pc_bh2";
  seam_fix_mode: "None" | "Band Pass" | "Half Tile" | "Half Tile + Intersections";
};

export default {
  "fewjative/ultimate-sd-upscale": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          positive_prompt: request.prompt,
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