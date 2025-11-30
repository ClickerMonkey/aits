import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    image?: string;
    prompt?: string;
    image_to_become?: string;
    negative_prompt?: string;
    prompt_strength?: number;
    number_of_images?: number;
    denoising_strength?: number;
    instant_id_strength?: number;
    image_to_become_noise?: number;
    control_depth_strength?: number;
    disable_safety_checker?: boolean;
    image_to_become_strength?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "fofr/become-image": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          image: await toURL(request.image),
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((url) => ({ url })),
        }),
      },
    };
    return transformer;
  })(),
}