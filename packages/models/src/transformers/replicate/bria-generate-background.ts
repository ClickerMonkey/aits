import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    fast?: boolean;
    seed?: number | null;
    sync?: boolean;
    image?: string | null;
    bg_prompt?: string | null;
    image_url?: string | null;
    force_rmbg?: boolean;
    ref_image_url?: string | null;
    refine_prompt?: boolean;
    ref_image_file?: string | null;
    negative_prompt?: string | null;
    original_quality?: boolean;
    enhance_ref_image?: boolean;
    content_moderation?: boolean;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "bria/generate-background": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          bg_prompt: request.prompt,
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((url) => ({ url })),
        }),
      },
    };
    return transformer;
  })(),
}