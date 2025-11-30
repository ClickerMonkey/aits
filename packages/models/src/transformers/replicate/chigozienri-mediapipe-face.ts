import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    bias?: number;
    images: string;
    blur_amount?: number;
    output_transparent_image?: boolean;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "chigozienri/mediapipe-face": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          images: await toURL(request.image),
          bias: request.extra?.bias,
          blur_amount: request.extra?.blur_amount,
          output_transparent_image: request.extra?.output_transparent_image,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((url) => ({ url })),
        }),
      },
    };
    return transformer;
  })(),
}