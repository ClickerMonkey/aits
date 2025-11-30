import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number | null;
    image?: string | null;
    prompt: string;
    aspect_ratio?: Schemas["aspect_ratio"];
    guidance_scale?: number | null;
    negative_prompt?: string | null;
    structured_prompt?: string | null;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  aspect_ratio: "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9";
};

export default {
  "bria/fibo": (() => {
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
          image: await toURL(request.image),
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