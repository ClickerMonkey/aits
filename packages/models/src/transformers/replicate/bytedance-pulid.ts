import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    prompt?: string;
    cfg_scale?: number;
    num_steps?: number;
    image_width?: number;
    num_samples?: number;
    image_height?: number;
    output_format?: Schemas["output_format"];
    identity_scale?: number;
    mix_identities?: boolean;
    output_quality?: number;
    generation_mode?: Schemas["generation_mode"];
    main_face_image: string;
    negative_prompt?: string;
    auxiliary_face_image1?: string;
    auxiliary_face_image2?: string;
    auxiliary_face_image3?: string;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  output_format: "webp" | "jpg" | "png";
  generation_mode: "fidelity" | "extremely style";
};

export default {
  "bytedance/pulid": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: any = {
            prompt: request.prompt,
            num_samples: request.n,
            seed: request.seed,
            ...request.extra,
          };
          if (request.size) {
            const [width, height] = request.size.split('x').map(Number);
            if (!isNaN(width) && !isNaN(height)) {
              input.image_width = width;
              input.image_height = height;
            }
          }
          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: any = {
            prompt: request.prompt,
            main_face_image: await toURL(request.image),
            num_samples: request.n,
            seed: request.seed,
            ...request.extra,
          };
          if (request.size) {
            const [width, height] = request.size.split('x').map(Number);
            if (!isNaN(width) && !isNaN(height)) {
              input.image_width = width;
              input.image_height = height;
            }
          }
          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
    };
    return transformer;
  })(),
}