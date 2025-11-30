import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    guidance?: number;
    megapixels?: Schemas["megapixels"];
    num_outputs?: number;
    redux_image: string;
    aspect_ratio?: Schemas["aspect_ratio"];
    output_format?: Schemas["output_format"];
    output_quality?: number;
    num_inference_steps?: number;
    disable_safety_checker?: boolean;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  megapixels: "1" | "0.25";
  aspect_ratio: "1:1" | "16:9" | "21:9" | "3:2" | "2:3" | "4:5" | "5:4" | "3:4" | "4:3" | "9:16" | "9:21";
  output_format: "webp" | "jpg" | "png";
};

export default {
  "black-forest-labs/flux-redux-dev": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          redux_image: await toURL(request.image),
          num_outputs: request.n,
          seed: request.seed,
          output_format: request.extra?.output_format,
          aspect_ratio: request.extra?.aspect_ratio,
          guidance: request.extra?.guidance,
          megapixels: request.extra?.megapixels,
          output_quality: request.extra?.output_quality,
          num_inference_steps: request.extra?.num_inference_steps,
          disable_safety_checker: request.extra?.disable_safety_checker,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((url) => ({ url })),
        }),
      },
    };
    return transformer;
  })(),
}