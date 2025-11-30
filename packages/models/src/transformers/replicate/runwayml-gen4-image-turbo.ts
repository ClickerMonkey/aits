import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number | null;
    prompt: string;
    resolution?: Schemas["resolution"];
    aspect_ratio?: Schemas["aspect_ratio"];
    reference_tags?: string[];
    reference_images?: string[];
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  resolution: "720p" | "1080p";
  aspect_ratio: "16:9" | "9:16" | "4:3" | "3:4" | "1:1" | "21:9";
};

export default {
  "runwayml/gen4-image-turbo": (() => {
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