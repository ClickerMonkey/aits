import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    width?: number | null;
    height?: number | null;
    prompt: string;
    resolution?: Schemas["resolution"];
    aspect_ratio?: Schemas["aspect_ratio"];
    input_images?: string[];
    output_format?: Schemas["output_format"];
    output_quality?: number;
    safety_tolerance?: number;
  };
  Output: string;
  resolution: "match_input_image" | "0.5 MP" | "1 MP" | "2 MP" | "4 MP";
  aspect_ratio: "match_input_image" | "custom" | "1:1" | "16:9" | "3:2" | "2:3" | "4:5" | "5:4" | "9:16" | "3:4" | "4:3";
  output_format: "webp" | "jpg" | "png";
};

export default {
  "black-forest-labs/flux-2-pro": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: Schemas["Input"] = {
            prompt: request.prompt,
            seed: request.seed,
            ...request.extra,
          };

          if (request.size) {
            if (['1:1', '16:9', '3:2', '2:3', '4:5', '5:4', '9:16', '3:4', '4:3', 'match_input_image'].includes(request.size)) {
              input.aspect_ratio = request.size as Schemas["aspect_ratio"];
            } else if (request.size.includes('x')) {
              const [width, height] = request.size.split('x').map(Number);
              if (!isNaN(width) && !isNaN(height)) {
                input.width = width;
                input.height = height;
                input.aspect_ratio = 'custom';
              }
            }
          }

          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          input_images: [await toURL(request.image)],
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })()
}