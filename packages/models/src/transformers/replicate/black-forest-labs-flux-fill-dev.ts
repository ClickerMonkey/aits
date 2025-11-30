import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    mask?: string;
    seed?: number;
    image: string;
    prompt: string;
    guidance?: number;
    lora_scale?: number;
    megapixels?: Schemas["megapixels"];
    num_outputs?: number;
    lora_weights?: string;
    output_format?: Schemas["output_format"];
    output_quality?: number;
    num_inference_steps?: number;
    disable_safety_checker?: boolean;
  };
  Output: string[];
  megapixels: "1" | "0.25" | "match_input";
  output_format: "webp" | "jpg" | "png";
};

export default {
  "black-forest-labs/flux-fill-dev": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          image: await toURL(request.image),
          mask: request.mask ? await toURL(request.mask) : undefined,
          num_outputs: request.n,
          seed: request.seed,
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