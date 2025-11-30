import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    prompt: string;
    aspect_ratio?: Schemas["aspect_ratio"];
    output_format?: Schemas["output_format"];
    safety_filter_level?: Schemas["safety_filter_level"];
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  aspect_ratio: "1:1" | "9:16" | "16:9" | "3:4" | "4:3";
  output_format: "jpg" | "png";
  safety_filter_level: "block_low_and_above" | "block_medium_and_above" | "block_only_high";
};

export default {
  "google/imagen-4-ultra": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
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