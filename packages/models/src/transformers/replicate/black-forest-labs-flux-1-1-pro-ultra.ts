import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    raw?: boolean;
    seed?: number;
    prompt: string;
    aspect_ratio?: Schemas["aspect_ratio"];
    image_prompt?: string;
    output_format?: Schemas["output_format"];
    safety_tolerance?: number;
    image_prompt_strength?: number;
  };
  Output: string;
  aspect_ratio: "21:9" | "16:9" | "3:2" | "4:3" | "5:4" | "1:1" | "4:5" | "3:4" | "2:3" | "9:16" | "9:21";
  output_format: "jpg" | "png";
};

export default {
  "black-forest-labs/flux-1.1-pro-ultra": (() => {
    const transformer: ReplicateTransformer = { 
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({ 
          prompt: request.prompt,
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          image_prompt: await toURL(request.image),
          seed: request.seed,
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