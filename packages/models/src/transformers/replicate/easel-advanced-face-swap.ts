import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    swap_image: string;
    hair_source?: Schemas["hair_source"];
    user_gender?: Schemas["user_gender"];
    swap_image_b?: string;
    target_image: string;
    user_b_gender?: Schemas["user_b_gender"];
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  hair_source: "user" | "target";
  user_gender: "default" | "a man" | "a woman" | "a nonbinary person";
  user_b_gender: "default" | "a man" | "a woman" | "a nonbinary person";
};

export default {
  "easel/advanced-face-swap": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          target_image: await toURL(request.image),
          swap_image: request.extra?.swap_image,
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