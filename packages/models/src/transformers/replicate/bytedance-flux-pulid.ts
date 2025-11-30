import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    width?: number;
    height?: number;
    prompt?: string;
    true_cfg?: number;
    id_weight?: number;
    num_steps?: number;
    start_step?: number;
    num_outputs?: number;
    output_format?: Schemas["output_format"];
    guidance_scale?: number;
    output_quality?: number;
    main_face_image: string;
    negative_prompt?: string;
    max_sequence_length?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  output_format: "png" | "jpg" | "webp";
};

export default {
  "bytedance/flux-pulid": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const extra = request.extra || {};
          const input: Schemas["Input"] = {
            prompt: request.prompt,
            main_face_image: extra.main_face_image,
            ...extra,
          };
          if (request.n) input.num_outputs = request.n;
          if (request.seed) input.seed = request.seed;
          if (request.size) {
            const [width, height] = request.size.split('x').map(Number);
            if (!isNaN(width) && !isNaN(height)) {
              input.width = width;
              input.height = height;
            }
          }
          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: response.map(url => ({ url })),
          };
        },
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const extra = request.extra || {};
          const input: Schemas["Input"] = {
            prompt: request.prompt,
            main_face_image: await toURL(request.image),
            ...extra,
          };
          if (request.n) input.num_outputs = request.n;
          if (request.seed) input.seed = request.seed;
          if (request.size) {
            const [width, height] = request.size.split('x').map(Number);
            if (!isNaN(width) && !isNaN(height)) {
              input.width = width;
              input.height = height;
            }
          }
          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: response.map(url => ({ url })),
          };
        },
      },
    };
    return transformer;
  })()
}