import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number | null;
    image?: string;
    prompt: string;
    go_fast?: boolean;
    guidance?: number;
    strength?: number;
    image_size?: Schemas["image_size"];
    lora_scale?: number;
    aspect_ratio?: Schemas["aspect_ratio"];
    lora_weights?: string | null;
    output_format?: Schemas["output_format"];
    enhance_prompt?: boolean;
    output_quality?: number;
    negative_prompt?: string;
    replicate_weights?: string | null;
    num_inference_steps?: number;
    disable_safety_checker?: boolean;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  image_size: "optimize_for_quality" | "optimize_for_speed";
  aspect_ratio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3";
  output_format: "webp" | "jpg" | "png";
};

export default {
  "qwen/qwen-image": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          seed: request.seed,
          ...(request.size && ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"].includes(request.size) 
            ? { aspect_ratio: request.size as any } 
            : {}),
          ...(request.quality === 'low' ? { image_size: 'optimize_for_speed' } : {}),
          ...(request.quality === 'high' ? { image_size: 'optimize_for_quality' } : {}),
          ...(request.responseFormat === 'url' ? { output_format: 'webp' } : {}),
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          image: await toURL(request.image),
          seed: request.seed,
          ...(request.size && ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"].includes(request.size) 
            ? { aspect_ratio: request.size as any } 
            : {}),
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
          extra: { response },
        }),
      },
    };
    return transformer;
  })(),
}