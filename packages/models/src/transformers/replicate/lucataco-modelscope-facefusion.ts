import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    user_image: string;
    template_image: string;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "lucataco/modelscope-facefusion": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          if (!request.extra?.user_image) {
            throw new Error("user_image is required in extra parameters for face fusion");
          }
          return {
            template_image: await toURL(request.image),
            user_image: await toURL(request.extra.user_image),
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          if (!request.extra?.user_image || !request.extra?.template_image) {
            throw new Error("user_image and template_image are required in extra parameters");
          }
          return {
            template_image: await toURL(request.extra.template_image),
            user_image: await toURL(request.extra.user_image),
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}