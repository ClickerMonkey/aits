import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    style?: Schemas["style"];
    prompt: string;
    contrast?: Schemas["contrast"];
    num_images?: number;
    aspect_ratio?: Schemas["aspect_ratio"];
    prompt_enhance?: boolean;
    generation_mode?: Schemas["generation_mode"];
  };
  style: "bokeh" | "cinematic" | "cinematic_close_up" | "creative" | "dynamic" | "fashion" | "film" | "food" | "hdr" | "long_exposure" | "macro" | "minimalist" | "monochrome" | "moody" | "neutral" | "none" | "portrait" | "retro" | "stock_photo" | "unprocessed" | "vibrant";
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  contrast: "low" | "medium" | "high";
  aspect_ratio: "1:1" | "16:9" | "9:16" | "3:2" | "2:3" | "4:5" | "5:4" | "3:4" | "4:3" | "2:1" | "1:2" | "3:1" | "1:3";
  generation_mode: "standard" | "ultra";
};

export default {
  "leonardoai/lucid-origin": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          num_images: request.n,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((url) => ({ url })),
        }),
      },
    };
    return transformer;
  })()
}