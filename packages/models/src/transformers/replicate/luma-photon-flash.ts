import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    prompt: string;
    aspect_ratio?: Schemas["aspect_ratio"];
    image_reference?: string;
    style_reference?: string;
    character_reference?: string;
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
  "luma/photon-flash": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const extra = request.extra || {};
          return {
            prompt: request.prompt,
            seed: request.seed,
            aspect_ratio: extra.aspect_ratio,
            image_reference: extra.image_reference ? await toURL(extra.image_reference) : undefined,
            style_reference: extra.style_reference ? await toURL(extra.style_reference) : undefined,
            character_reference: extra.character_reference ? await toURL(extra.character_reference) : undefined,
            image_reference_weight: extra.image_reference_weight,
            style_reference_weight: extra.style_reference_weight,
            ...extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}