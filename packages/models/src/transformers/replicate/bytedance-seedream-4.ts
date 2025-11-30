import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  size: "1K" | "2K" | "4K" | "custom";
  Input: {
    size?: Schemas["size"];
    width?: number;
    height?: number;
    prompt: string;
    max_images?: number;
    image_input?: string[];
    aspect_ratio?: Schemas["aspect_ratio"];
    enhance_prompt?: boolean;
    sequential_image_generation?: Schemas["sequential_image_generation"];
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  aspect_ratio: "match_input_image" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "3:2" | "2:3" | "21:9";
  sequential_image_generation: "disabled" | "auto";
};

export default {
  "bytedance/seedream-4": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: Schemas["Input"] = {
            prompt: request.prompt,
            ...request.extra,
          };
          if (request.n) {
            input.max_images = request.n;
          }
          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((url) => ({ url })),
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: Schemas["Input"] = {
            prompt: request.prompt,
            image_input: [await toURL(request.image)],
            ...request.extra,
          };
          if (request.n) {
            input.max_images = request.n;
          }
          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((url) => ({ url })),
        }),
      },
    };
    return transformer;
  })(),
}