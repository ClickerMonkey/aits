import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    mask?: string;
    seed?: number;
    sync?: boolean;
    image?: string;
    prompt: string;
    mask_type?: Schemas["mask_type"];
    preserve_alpha?: boolean;
    negative_prompt?: string;
    content_moderation?: boolean;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  mask_type: "manual" | "automatic";
};

export default {
  "bria/genfill": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          image: await toURL(request.image),
          mask: request.mask ? await toURL(request.mask) : undefined,
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
    };
    return transformer;
  })(),
}