import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    fps?: number;
    seed?: number | null;
    media: string;
    sp_size?: number;
    cfg_scale?: number;
    sample_steps?: number;
    model_variant?: Schemas["model_variant"];
    output_format?: Schemas["output_format"];
    output_quality?: number;
    apply_color_fix?: boolean;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  model_variant: "3b" | "7b";
  output_format: "png" | "webp" | "jpg";
};

export default {
  "zsxkib/seedvr2": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          media: await toURL(request.image),
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })()
}