import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    steps?: number;
    width?: number | null;
    height?: number | null;
    prompt: string;
    guidance?: number;
    resolution?: Schemas["resolution"];
    aspect_ratio?: Schemas["aspect_ratio"];
    input_images?: string[];
    output_format?: Schemas["output_format"];
    output_quality?: number;
    safety_tolerance?: number;
    prompt_upsampling?: boolean;
  };
  Output: string;
  resolution: "match_input_image" | "0.5 MP" | "1 MP" | "2 MP" | "4 MP";
  aspect_ratio: "match_input_image" | "custom" | "1:1" | "16:9" | "3:2" | "2:3" | "4:5" | "5:4" | "9:16" | "3:4" | "4:3";
  output_format: "webp" | "jpg" | "png";
};

export default {
  "black-forest-labs/flux-2-flex": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          input_images: [await toURL(request.image)],
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