import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    input: string;
    steps?: number;
    tiled?: boolean;
    tile_size?: number;
    has_aligned?: boolean;
    tile_stride?: number;
    repeat_times?: number;
    use_guidance?: boolean;
    color_fix_type?: Schemas["color_fix_type"];
    guidance_scale?: number;
    guidance_space?: Schemas["guidance_space"];
    guidance_repeat?: number;
    only_center_face?: boolean;
    guidance_time_stop?: number;
    guidance_time_start?: number;
    background_upsampler?: Schemas["background_upsampler"];
    face_detection_model?: Schemas["face_detection_model"];
    upscaling_model_type?: Schemas["upscaling_model_type"];
    restoration_model_type?: Schemas["restoration_model_type"];
    super_resolution_factor?: number;
    disable_preprocess_model?: boolean;
    reload_restoration_model?: boolean;
    background_upsampler_tile?: number;
    background_upsampler_tile_stride?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  color_fix_type: "wavelet" | "adain" | "none";
  guidance_space: "rgb" | "latent";
  background_upsampler: "DiffBIR" | "RealESRGAN";
  face_detection_model: "retinaface_resnet50" | "retinaface_mobile0.25" | "YOLOv5l" | "YOLOv5n" | "dlib";
  upscaling_model_type: "faces" | "general_scenes";
  restoration_model_type: "faces" | "general_scenes";
};

export default {
  "zsxkib/diffbir": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          input: await toURL(request.image),
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