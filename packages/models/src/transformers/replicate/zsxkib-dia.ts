import { toURL, toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number | null;
    text: string;
    top_p?: number;
    cfg_scale?: number;
    temperature?: number;
    audio_prompt?: string | null;
    speed_factor?: number;
    max_new_tokens?: number;
    cfg_filter_top_k?: number;
    audio_prompt_text?: string | null;
    max_audio_prompt_seconds?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "zsxkib/dia": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          return {
            text: request.text,
            audio_prompt: request.voice ? await toURL(request.voice) : undefined,
            speed_factor: request.speed,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            audio: await toReadableStream(response),
          };
        },
      },
    };
    return transformer;
  })(),
}