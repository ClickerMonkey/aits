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
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  model_type: "dev";
  resolution: "1024 × 1024 (Square)" | "768 × 1360 (Portrait)" | "1360 × 768 (Landscape)" | "880 × 1168 (Portrait)" | "1168 × 880 (Landscape)" | "1248 × 832 (Landscape)" | "832 × 1248 (Portrait)";
  speed_mode: "Unsqueezed 🍋 (highest quality)" | "Lightly Juiced 🍊 (more consistent)" | "Juiced 🔥 (more speed)" | "Extra Juiced 🚀 (even more speed)";
  output_format: "png" | "jpg" | "webp";
};

export default {
  "prunaai/hidream-l1-dev": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let resolution: Schemas["Input"]["resolution"] | undefined;
          if (request.size === "1024x1024") resolution = "1024 × 1024 (Square)";
          else if (request.size === "768x1360") resolution = "768 × 1360 (Portrait)";
          else if (request.size === "1360x768") resolution = "1360 × 768 (Landscape)";
          else if (request.size === "880x1168") resolution = "880 × 1168 (Portrait)";
          else if (request.size === "1168x880") resolution = "1168 × 880 (Landscape)";
          else if (request.size === "1248x832") resolution = "1248 × 832 (Landscape)";
          else if (request.size === "832x1248") resolution = "832 × 1248 (Portrait)";

          let output_quality: number | undefined;
          if (request.quality === 'low') output_quality = 60;
          else if (request.quality === 'medium') output_quality = 80;
          else if (request.quality === 'high') output_quality = 100;

          return {
            prompt: request.prompt,
            seed: request.seed,
            resolution,
            output_quality,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}