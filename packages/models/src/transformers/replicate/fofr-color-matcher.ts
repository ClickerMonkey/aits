import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    method?: Schemas["method"];
    strength?: number;
    input_image: string;
    reference_image?: string;
    fix_white_balance?: boolean;
    white_balance_percentile?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  method: "mkl" | "hm" | "reinhard" | "mvgd" | "hm-mvgd-hm" | "hm-mkl-hm";
};

export default {
  "fofr/color-matcher": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const { reference_image, ...rest } = request.extra || {};
          return {
            input_image: await toURL(request.image),
            ...(reference_image ? { reference_image: await toURL(reference_image) } : {}),
            ...rest,
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