import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number | null;
    width?: number | null;
    height?: number | null;
    prompt: string;
    go_fast?: boolean;
    aspect_ratio?: Schemas["aspect_ratio"];
    input_images?: string[];
    output_format?: Schemas["output_format"];
    output_quality?: number;
    disable_safety_checker?: boolean;
  };
  Output: string;
  aspect_ratio: "match_input_image" | "custom" | "1:1" | "16:9" | "3:2" | "2:3" | "4:5" | "5:4" | "9:16" | "3:4" | "4:3";
  output_format: "webp" | "jpg" | "png";
};

export default {
  "black-forest-labs/flux-2-dev": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let width: number | undefined;
          let height: number | undefined;
          let aspect_ratio: Schemas["Input"]["aspect_ratio"] | undefined;

          if (request.size) {
            const parts = request.size.split("x").map(Number);
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              width = parts[0];
              height = parts[1];
              aspect_ratio = "custom";
            }
          }

          return {
            prompt: request.prompt,
            seed: request.seed,
            width,
            height,
            aspect_ratio,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: [{ url: response }],
          };
        },
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          return {
            prompt: request.prompt,
            seed: request.seed,
            input_images: [await toURL(request.image)],
            aspect_ratio: "match_input_image",
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: [{ url: response }],
          };
        },
      },
    };
    return transformer;
  })(),
}