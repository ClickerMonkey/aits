import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    image: string;
    prompt?: string;
    scheduler?: Schemas["scheduler"];
    enable_lcm?: boolean;
    pose_image?: string;
    num_outputs?: number;
    sdxl_weights?: Schemas["sdxl_weights"];
    output_format?: Schemas["output_format"];
    pose_strength?: number;
    canny_strength?: number;
    depth_strength?: number;
    guidance_scale?: number;
    output_quality?: number;
    negative_prompt?: string;
    ip_adapter_scale?: number;
    lcm_guidance_scale?: number;
    num_inference_steps?: number;
    disable_safety_checker?: boolean;
    enable_pose_controlnet?: boolean;
    enhance_nonface_region?: boolean;
    enable_canny_controlnet?: boolean;
    enable_depth_controlnet?: boolean;
    lcm_num_inference_steps?: number;
    face_detection_input_width?: number;
    face_detection_input_height?: number;
    controlnet_conditioning_scale?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  scheduler: "DEISMultistepScheduler" | "HeunDiscreteScheduler" | "EulerDiscreteScheduler" | "DPMSolverMultistepScheduler" | "DPMSolverMultistepScheduler-Karras" | "DPMSolverMultistepScheduler-Karras-SDE";
  sdxl_weights: "stable-diffusion-xl-base-1.0" | "juggernaut-xl-v8" | "afrodite-xl-v2" | "albedobase-xl-20" | "albedobase-xl-v13" | "animagine-xl-30" | "anime-art-diffusion-xl" | "anime-illust-diffusion-xl" | "dreamshaper-xl" | "dynavision-xl-v0610" | "guofeng4-xl" | "nightvision-xl-0791" | "omnigen-xl" | "pony-diffusion-v6-xl" | "protovision-xl-high-fidel" | "RealVisXL_V3.0_Turbo" | "RealVisXL_V4.0_Lightning";
  output_format: "webp" | "jpg" | "png";
};

export default {
  "zsxkib/instant-id": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          image: await toURL(request.image),
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