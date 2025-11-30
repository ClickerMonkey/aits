import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number | null;
    image: string;
    prompt: string;
    go_fast?: boolean;
    output_format?: Schemas["output_format"];
    output_quality?: number;
    disable_safety_checker?: boolean;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  output_format: "webp" | "jpg" | "png";
};

export default {
  "qwen/qwen-image-edit": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          image: await toURL(request.image),
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
    };
    return transformer;
  })(),
}