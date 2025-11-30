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
  model_type: "full";
  resolution: "1024 × 1024 (Square)" | "768 × 1360 (Portrait)" | "1360 × 768 (Landscape)" | "880 × 1168 (Portrait)" | "1168 × 880 (Landscape)" | "1248 × 832 (Landscape)" | "832 × 1248 (Portrait)";
  speed_mode: "Unsqueezed 🍋 (highest quality)" | "Lightly Juiced 🍊 (more consistent)" | "Juiced 🔥 (more speed)" | "Extra Juiced 🚀 (even more speed)";
  output_format: "png" | "jpg" | "webp";
};

export default {
  "prunaai/hidream-l1-full": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const sizeMap: Record<string, Schemas["resolution"]> = {
            "1024x1024": "1024 × 1024 (Square)",
            "768x1360": "768 × 1360 (Portrait)",
            "1360x768": "1360 × 768 (Landscape)",
            "880x1168": "880 × 1168 (Portrait)",
            "1168x880": "1168 × 880 (Landscape)",
            "1248x832": "1248 × 832 (Landscape)",
            "832x1248": "832 × 1248 (Portrait)"
          };

          let resolution: Schemas["resolution"] | undefined;
          if (request.size && sizeMap[request.size]) {
            resolution = sizeMap[request.size];
          }

          let output_quality: number | undefined;
          if (request.quality) {
            output_quality = request.quality === 'low' ? 60 : request.quality === 'medium' ? 80 : 100;
          }

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