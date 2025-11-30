import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    prompt: string;
    aspect_ratio?: Schemas["aspect_ratio"];
    image_reference_url?: string;
    style_reference_url?: string;
    image_reference_weight?: number;
    style_reference_weight?: number;
    character_reference_url?: string;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  aspect_ratio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "9:21" | "21:9";
};

export default {
  "luma/photon": (() => {
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
    };
    return transformer;
  })(),
}