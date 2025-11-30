import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number | null;
    prompt: string;
    aspect_ratio?: Schemas["aspect_ratio"];
    input_image_1: string;
    input_image_2: string;
    output_format?: Schemas["output_format"];
    safety_tolerance?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  aspect_ratio: "match_input_image" | "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3" | "4:5" | "5:4" | "21:9" | "9:21" | "2:1" | "1:2";
  output_format: "jpg" | "png";
};

export default {
  "flux-kontext-apps/multi-image-kontext-max": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const extra = request.extra || {};
          if (!extra.input_image_1 || !extra.input_image_2) {
            throw new Error("input_image_1 and input_image_2 are required in extra parameters for this model");
          }
          return {
            prompt: request.prompt,
            input_image_1: await toURL(extra.input_image_1),
            input_image_2: await toURL(extra.input_image_2),
            seed: request.seed,
            aspect_ratio: extra.aspect_ratio,
            output_format: extra.output_format,
            safety_tolerance: extra.safety_tolerance,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const extra = request.extra || {};
          if (!extra.input_image_2) {
            throw new Error("input_image_2 is required in extra parameters for this model");
          }
          return {
            prompt: request.prompt,
            input_image_1: await toURL(request.image),
            input_image_2: await toURL(extra.input_image_2),
            seed: request.seed,
            aspect_ratio: extra.aspect_ratio,
            output_format: extra.output_format,
            safety_tolerance: extra.safety_tolerance,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}