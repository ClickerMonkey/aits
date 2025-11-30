import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    prompt: string;
    model_type?: Schemas["model_type"];
    resolution?: Schemas["resolution"];
    speed_mode?: Schemas["speed_mode"];
    output_format?: Schemas["output_format"];
    output_quality?: number;
    negative_prompt?: string;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  model_type: "fast";
  resolution: "1024 × 1024 (Square)" | "768 × 1360 (Portrait)" | "1360 × 768 (Landscape)" | "880 × 1168 (Portrait)" | "1168 × 880 (Landscape)" | "1248 × 832 (Landscape)" | "832 × 1248 (Portrait)";
  speed_mode: "Unsqueezed 🍋 (highest quality)" | "Lightly Juiced 🍊 (more consistent)" | "Juiced 🔥 (more speed)" | "Extra Juiced 🚀 (even more speed)";
  output_format: "png" | "jpg" | "webp";
};

export default {
  "prunaai/hidream-l1-fast": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          seed: request.seed,
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