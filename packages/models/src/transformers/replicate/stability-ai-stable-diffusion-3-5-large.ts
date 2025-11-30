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
  "stability-ai/stable-diffusion-3.5-large": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: Schemas["Input"] = {
            prompt: request.prompt,
            seed: request.seed,
            ...request.extra,
          };
          
          // Map size to aspect_ratio if provided and not in extra
          if (request.size && !input.aspect_ratio) {
            const sizeMap: Record<string, Schemas["aspect_ratio"]> = {
              "1:1": "1:1", "1024x1024": "1:1",
              "16:9": "16:9", "1920x1080": "16:9",
              "2:3": "2:3", "3:2": "3:2",
              "4:5": "4:5", "5:4": "5:4",
              "9:16": "9:16", "1080x1920": "9:16",
              "21:9": "21:9", "9:21": "9:21"
            };
            if (sizeMap[request.size]) {
              input.aspect_ratio = sizeMap[request.size];
            }
          }

          return input;
        },
        parseResponse: async (response: any, ctx) => {
          // Replicate returns an array of strings for this model
          const urls = Array.isArray(response) ? response : [response];
          return {
            images: urls.map((url: string) => ({ url })),
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
        parseResponse: async (response: any, ctx) => {
          const urls = Array.isArray(response) ? response : [response];
          return {
            images: urls.map((url: string) => ({ url })),
          };
        },
      },
    };
    return transformer;
  })(),
}