import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number | null;
    steps?: number;
    prompt: string;
    guidance?: number;
    control_image: string;
    output_format?: Schemas["output_format"];
    safety_tolerance?: number;
    prompt_upsampling?: boolean;
  };
  Output: string;
  output_format: "jpg" | "png";
};

export default {
  "black-forest-labs/flux-depth-pro": (() => {
    const transformer: ReplicateTransformer = { 
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({ 
          prompt: request.prompt,
          control_image: await toURL(request.image),
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