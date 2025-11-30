import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    prompt: string;
    guidance?: number;
    input_image: string;
    aspect_ratio?: Schemas["aspect_ratio"];
    output_format?: Schemas["output_format"];
    output_quality?: number;
    num_inference_steps?: number;
    disable_safety_checker?: boolean;
  };
  Output: string;
  aspect_ratio: "1:1" | "16:9" | "21:9" | "3:2" | "2:3" | "4:5" | "5:4" | "3:4" | "4:3" | "9:16" | "9:21" | "match_input_image";
  output_format: "webp" | "jpg" | "png";
};

export default {
  "black-forest-labs/flux-kontext-dev": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          input_image: await toURL(request.image),
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