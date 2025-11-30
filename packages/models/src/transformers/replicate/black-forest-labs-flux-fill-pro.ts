import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    mask?: string;
    seed?: number;
    image: string;
    steps?: number;
    prompt: string;
    guidance?: number;
    outpaint?: Schemas["outpaint"];
    output_format?: Schemas["output_format"];
    safety_tolerance?: number;
    prompt_upsampling?: boolean;
  };
  Output: string;
  outpaint: "None" | "Zoom out 1.5x" | "Zoom out 2x" | "Make square" | "Left outpaint" | "Right outpaint" | "Top outpaint" | "Bottom outpaint";
  output_format: "jpg" | "png";
};

export default {
  "black-forest-labs/flux-fill-pro": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          return {
            prompt: request.prompt,
            image: await toURL(request.image),
            mask: request.mask ? await toURL(request.mask) : undefined,
            seed: request.seed,
            ...request.extra,
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