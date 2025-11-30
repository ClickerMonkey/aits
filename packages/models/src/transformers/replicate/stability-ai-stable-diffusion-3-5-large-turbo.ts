import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    cfg?: number;
    seed?: number | null;
    image?: string | null;
    prompt: string;
    aspect_ratio?: Schemas["aspect_ratio"];
    output_format?: Schemas["output_format"];
    negative_prompt?: string | null;
    prompt_strength?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  aspect_ratio: "16:9" | "1:1" | "21:9" | "2:3" | "3:2" | "4:5" | "5:4" | "9:16" | "9:21";
  output_format: "webp" | "jpg" | "png";
};

export default {
  "stability-ai/stable-diffusion-3.5-large-turbo": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => {
          const output = response as unknown as string | string[];
          const urls = Array.isArray(output) ? output : [output];
          return {
            images: urls.map(url => ({ url })),
          };
        },
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          image: await toURL(request.image),
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => {
          const output = response as unknown as string | string[];
          const urls = Array.isArray(output) ? output : [output];
          return {
            images: urls.map(url => ({ url })),
          };
        },
      },
    };
    return transformer;
  })(),
}