import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    alpha?: number;
    prompt_a?: string;
    prompt_b?: string;
    denoising?: number;
    seed_image_id?: Schemas["seed_image_id"];
    num_inference_steps?: number;
  };
  Output: {
    audio: string;
    spectrogram: string;
  };
  Status: "processing" | "succeeded" | "canceled" | "failed";
  seed_image_id: "agile" | "marim" | "mask_beat_lines_80" | "mask_gradient_dark" | "mask_gradient_top_70" | "mask_graident_top_fifth_75" | "mask_top_third_75" | "mask_top_third_95" | "motorway" | "og_beat" | "vibes";
};

export default { 
  "riffusion/riffusion": (() => {
    const transformer: ReplicateTransformer = { 
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({ 
          prompt_a: request.text,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          audio: await toReadableStream(response.audio),
        }),
      },
    };
    return transformer;
  })(),
}