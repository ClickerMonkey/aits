import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number | null;
    sync?: boolean;
    image?: string | null;
    prompt?: string | null;
    image_url?: string | null;
    canvas_size?: number[] | null;
    aspect_ratio?: Schemas["aspect_ratio"];
    preserve_alpha?: boolean;
    negative_prompt?: string | null;
    content_moderation?: boolean;
    original_image_size?: number[] | null;
    original_image_location?: number[] | null;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  aspect_ratio: "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9";
};

export default {
  "bria/expand-image": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
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