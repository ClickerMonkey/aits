import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    upscale?: number;
    face_upsample?: boolean;
    background_enhance?: boolean;
    codeformer_fidelity?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "sczhou/codeformer": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          upscale: request.extra?.upscale,
          face_upsample: request.extra?.face_upsample,
          background_enhance: request.extra?.background_enhance,
          codeformer_fidelity: request.extra?.codeformer_fidelity,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}