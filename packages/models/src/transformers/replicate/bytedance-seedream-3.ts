import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  size: "small" | "regular" | "big";
  Input: {
    seed?: number | null;
    size?: Schemas["size"];
    width?: number;
    height?: number;
    prompt: string;
    aspect_ratio?: Schemas["aspect_ratio"];
    guidance_scale?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  aspect_ratio: "1:1" | "3:4" | "4:3" | "16:9" | "9:16" | "2:3" | "3:2" | "21:9" | "custom";
};

export default {
  "bytedance/seedream-3": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: Schemas["Input"] = {
            prompt: request.prompt,
            seed: request.seed,
            ...request.extra,
          };

          if (request.size) {
            const match = request.size.match(/^(\d+)x(\d+)$/);
            if (match) {
              input.width = parseInt(match[1], 10);
              input.height = parseInt(match[2], 10);
              input.aspect_ratio = "custom";
            } else if (["small", "regular", "big"].includes(request.size)) {
              input.size = request.size as Schemas["size"];
            }
          }

          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: [{ url: await toURL(response) }],
          };
        },
      },
    };
    return transformer;
  })(),
}