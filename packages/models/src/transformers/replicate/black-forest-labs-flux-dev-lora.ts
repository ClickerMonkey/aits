import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    image?: string;
    prompt: string;
    go_fast?: boolean;
    guidance?: number;
    extra_lora?: string;
    lora_scale?: number;
    megapixels?: Schemas["megapixels"];
    num_outputs?: number;
    aspect_ratio?: Schemas["aspect_ratio"];
    hf_api_token?: string;
    lora_weights?: string;
    output_format?: Schemas["output_format"];
    output_quality?: number;
    prompt_strength?: number;
    extra_lora_scale?: number;
    civitai_api_token?: string;
    num_inference_steps?: number;
    disable_safety_checker?: boolean;
  };
  Output: string[];
  megapixels: "1" | "0.25";
  aspect_ratio: "1:1" | "16:9" | "21:9" | "3:2" | "2:3" | "4:5" | "5:4" | "3:4" | "4:3" | "9:16" | "9:21";
  output_format: "webp" | "jpg" | "png";
};

export default {
  "black-forest-labs/flux-dev-lora": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          num_outputs: request.n,
          seed: request.seed,
          output_quality: request.quality === 'low' ? 60 : request.quality === 'high' ? 100 : 80,
          output_format: request.extra?.output_format || "webp",
          aspect_ratio: request.extra?.aspect_ratio || "1:1",
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map(url => ({ url })),
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          image: await toURL(request.image),
          num_outputs: request.n,
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map(url => ({ url })),
        }),
      },
    };
    return transformer;
  })(),
}