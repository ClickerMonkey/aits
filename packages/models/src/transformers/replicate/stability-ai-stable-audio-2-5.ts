import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number | null;
    steps?: number;
    prompt: string;
    duration?: number;
    cfg_scale?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "stability-ai/stable-audio-2.5": (() => {
    const transformer: ReplicateTransformer = { 
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({ 
          prompt: request.text,
          seed: request.extra?.seed,
          steps: request.extra?.steps,
          duration: request.extra?.duration,
          cfg_scale: request.extra?.cfg_scale,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          audio: await toReadableStream(response),
        }),
      },
    };
    return transformer;
  })(),
}