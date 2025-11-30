import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    prompt?: string;
    strength?: number;
    face_image: string;
    blur_amount?: number;
    num_outputs?: number;
    source_image?: string;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "lucataco/ip_adapter-face-inpaint": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          face_image: request.extra?.face_image,
          num_outputs: request.n,
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map(url => ({ url })),
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          source_image: await toURL(request.image),
          prompt: request.prompt,
          face_image: request.extra?.face_image,
          num_outputs: request.n,
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map(url => ({ url })),
        }),
      },
    };
    return transformer;
  })(),
}