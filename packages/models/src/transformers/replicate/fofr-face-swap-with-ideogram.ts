import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';



export default {
  "fofr/face-swap-with-ideogram": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx) => {
          const extra = request.extra || {};
          return {
            target_image: await toURL(request.image),
            character_image: extra.character_image ? await toURL(extra.character_image) : undefined,
            prompt: request.prompt,
            cleanup: extra.cleanup,
            ...extra,
          };
        },
        parseResponse: async (response, ctx) => {
          return {
            images: [{ url: await toURL(response) }],
          };
        },
      },
    };
    return transformer;
  })(),
}