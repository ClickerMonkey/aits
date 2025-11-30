import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    mask?: string | null;
    sync?: boolean;
    image?: string | null;
    mask_url?: string | null;
    image_url?: string | null;
    mask_type?: Schemas["mask_type"];
    preserve_alpha?: boolean;
    content_moderation?: boolean;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  mask_type: "manual" | "automatic";
};

export default { 
  "bria/eraser": (() => {
    const transformer: ReplicateTransformer = { 
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          mask: request.mask ? await toURL(request.mask) : undefined,
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