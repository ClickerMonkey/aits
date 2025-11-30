import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    prompt: string;
    guidance?: number;
    image_size?: number;
    speed_mode?: Schemas["speed_mode"];
    aspect_ratio?: Schemas["aspect_ratio"];
    output_format?: Schemas["output_format"];
    output_quality?: number;
    num_inference_steps?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  speed_mode: "Lightly Juiced 🍊 (more consistent)" | "Juiced 🔥 (default)" | "Extra Juiced 🔥 (more speed)" | "Blink of an eye 👁️";
  aspect_ratio: "1:1" | "16:9" | "21:9" | "3:2" | "2:3" | "4:5" | "5:4" | "3:4" | "4:3" | "9:16" | "9:21";
  output_format: "png" | "jpg" | "webp";
};

export default {
  "prunaai/flux-fast": (() => {
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