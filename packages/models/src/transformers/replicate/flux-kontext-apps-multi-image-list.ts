import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number | null;
    prompt: string;
    aspect_ratio?: Schemas["aspect_ratio"];
    input_images: string[];
    output_format?: Schemas["output_format"];
    safety_tolerance?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  aspect_ratio: "match_input_image" | "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3" | "4:5" | "5:4" | "21:9" | "9:21" | "2:1" | "1:2";
  output_format: "jpg" | "png";
};

export default {
  "flux-kontext-apps/multi-image-list": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          input_images: request.extra?.input_images || [],
          seed: request.seed,
          aspect_ratio: request.extra?.aspect_ratio,
          output_format: request.extra?.output_format || "png",
          safety_tolerance: request.extra?.safety_tolerance,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const mainImage = await toURL(request.image);
          const extraImages = Array.isArray(request.extra?.input_images) ? request.extra.input_images : [];
          return {
            prompt: request.prompt,
            input_images: [mainImage, ...extraImages],
            seed: request.seed,
            aspect_ratio: request.extra?.aspect_ratio,
            output_format: request.extra?.output_format || "png",
            safety_tolerance: request.extra?.safety_tolerance,
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