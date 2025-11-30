import { toURL, toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    prompt: string;
    cfg_weight?: number;
    temperature?: number;
    audio_prompt?: string;
    exaggeration?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "resemble-ai/chatterbox": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let audio_prompt: string | undefined;
          if (request.voice) {
            audio_prompt = await toURL(request.voice);
          }
          return {
            prompt: request.text,
            audio_prompt,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            audio: await toReadableStream(response),
            extra: { response },
          };
        },
      },
    };
    return transformer;
  })(),
}