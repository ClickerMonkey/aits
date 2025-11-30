import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    image: string;
    width?: number;
    height?: number;
    prompt?: string;
    image_2?: string;
    image_3?: string;
    scheduler?: Schemas["scheduler"];
    max_pixels?: number;
    cfg_range_end?: number;
    cfg_range_start?: number;
    negative_prompt?: string;
    num_inference_steps?: number;
    text_guidance_scale?: number;
    image_guidance_scale?: number;
    max_input_image_side_length?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  scheduler: "euler" | "dpmsolver";
};

export default {
  "lucataco/omnigen2": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          prompt: request.prompt,
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