import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  task: "text-to-image" | "image-editing" | "image-understanding";
  Input: {
    seed?: number;
    task?: Schemas["task"];
    image?: string;
    prompt: string;
    cfg_img_scale?: number;
    output_format?: Schemas["output_format"];
    cfg_renorm_min?: number;
    cfg_text_scale?: number;
    output_quality?: number;
    timestep_shift?: number;
    cfg_renorm_type?: Schemas["cfg_renorm_type"];
    enable_thinking?: boolean;
    num_inference_steps?: number;
  };
  Output: Schemas["BagelOutput"];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  BagelOutput: {
    text?: string;
    image?: string;
  };
  output_format: "webp" | "jpg" | "png";
  cfg_renorm_type: "global" | "local" | "text_channel";
};

export default {
  "bytedance/bagel": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          task: "text-to-image",
          prompt: request.prompt,
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.image ? [{ url: await toURL(response.image) }] : [],
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          task: "image-editing",
          prompt: request.prompt,
          image: await toURL(request.image),
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.image ? [{ url: await toURL(response.image) }] : [],
        }),
      },
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const image = request.images && request.images.length > 0 ? request.images[0] : undefined;
          return {
            task: "image-understanding",
            prompt: request.prompt,
            image: image ? await toURL(image) : undefined,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          content: response.text || "",
          finishReason: "stop",
        }),
      },
    };
    return transformer;
  })(),
}