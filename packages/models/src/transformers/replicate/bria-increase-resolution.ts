import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    sync?: boolean;
    image?: string | null;
    image_url?: string | null;
    preserve_alpha?: boolean;
    desired_increase?: Schemas["desired_increase"];
    content_moderation?: boolean;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  desired_increase: 2 | 4;
};

export default {
  "bria/increase-resolution": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: response }],
        }),
      },
    };
    return transformer;
  })(),
}