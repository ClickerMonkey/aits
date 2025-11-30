import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    model?: Schemas["model"];
    top_p?: number;
    prompt?: string;
    max_cfg?: number;
    min_cfg?: number;
    span_score?: Schemas["span_score"];
    variations?: number;
    temperature?: number;
    decoding_steps_stage_1?: number;
    decoding_steps_stage_2?: number;
    decoding_steps_stage_3?: number;
    decoding_steps_stage_4?: number;
  };
  model: "facebook/magnet-small-10secs" | "facebook/magnet-medium-10secs" | "facebook/magnet-small-30secs" | "facebook/magnet-medium-30secs" | "facebook/audio-magnet-small" | "facebook/audio-magnet-medium";
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  span_score: "max-nonoverlap" | "prod-stride1";
};

export default {
  "lucataco/magnet": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.text,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => {
          const url = response[0];
          if (!url) throw new Error("No audio URL returned from model");
          return {
            audio: await toReadableStream(url),
            extra: { response },
          };
        },
      },
    };
    return transformer;
  })(),
}