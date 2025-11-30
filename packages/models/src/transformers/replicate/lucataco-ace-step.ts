import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    tags: string;
    lyrics?: string;
    duration?: number;
    scheduler?: Schemas["scheduler"];
    guidance_type?: Schemas["guidance_type"];
    guidance_scale?: number;
    number_of_steps?: number;
    granularity_scale?: number;
    guidance_interval?: number;
    min_guidance_scale?: number;
    tag_guidance_scale?: number;
    lyric_guidance_scale?: number;
    guidance_interval_decay?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  scheduler: "euler" | "heun";
  guidance_type: "apg" | "cfg" | "cfg_star";
};

export default { 
  "lucataco/ace-step": (() => {
    const transformer: ReplicateTransformer = { 
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({ 
          tags: request.text,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          audio: await toReadableStream(response),
        }),
      },
    };
    return transformer;
  })(),
}