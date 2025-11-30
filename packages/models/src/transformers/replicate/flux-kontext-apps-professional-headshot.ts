import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number | null;
    gender?: Schemas["gender"];
    background?: Schemas["background"];
    input_image: string;
    aspect_ratio?: Schemas["aspect_ratio"];
    output_format?: Schemas["output_format"];
    safety_tolerance?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  gender: "none" | "male" | "female";
  background: "white" | "black" | "neutral" | "gray" | "office";
  aspect_ratio: "match_input_image" | "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3" | "4:5" | "5:4" | "21:9" | "9:21" | "2:1" | "1:2";
  output_format: "jpg" | "png";
};

export default {
  "flux-kontext-apps/professional-headshot": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          input_image: await toURL(request.image),
          seed: request.seed,
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