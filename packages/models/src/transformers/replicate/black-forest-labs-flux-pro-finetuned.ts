import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    steps?: number;
    width?: number;
    height?: number;
    prompt: string;
    guidance?: number;
    finetune_id: string;
    aspect_ratio?: Schemas["aspect_ratio"];
    image_prompt?: string;
    output_format?: Schemas["output_format"];
    safety_tolerance?: number;
    finetune_strength?: number;
    prompt_upsampling?: boolean;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  aspect_ratio: "custom" | "1:1" | "16:9" | "3:2" | "2:3" | "4:5" | "5:4" | "9:16" | "3:4" | "4:3";
  output_format: "jpg" | "png";
};

export default {
  "black-forest-labs/flux-pro-finetuned": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: Schemas["Input"] = {
            prompt: request.prompt,
            finetune_id: request.extra?.finetune_id,
            ...request.extra,
          };

          if (request.seed !== undefined) {
            input.seed = request.seed;
          }

          if (request.size) {
            const validRatios = ["1:1", "16:9", "3:2", "2:3", "4:5", "5:4", "9:16", "3:4", "4:3"];
            if (validRatios.includes(request.size)) {
              input.aspect_ratio = request.size as Schemas["aspect_ratio"];
            } else {
              const parts = request.size.split("x").map(Number);
              if (parts.length === 2 && !parts.some(isNaN)) {
                input.aspect_ratio = "custom";
                input.width = parts[0];
                input.height = parts[1];
              }
            }
          }

          if (request.extra?.image_prompt) {
            input.image_prompt = await toURL(request.extra.image_prompt);
          }

          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: [{ url: await toURL(response) }],
          };
        },
      },
    };
    return transformer;
  })(),
}