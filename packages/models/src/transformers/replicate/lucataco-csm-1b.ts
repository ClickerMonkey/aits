import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    text?: string;
    speaker?: Schemas["speaker"];
    max_audio_length_ms?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  speaker: 0 | 1;
};

export default {
  "lucataco/csm-1b": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let speaker: Schemas["Input"]["speaker"];
          if (request.voice) {
            const parsed = parseInt(request.voice);
            if (parsed === 0 || parsed === 1) {
              speaker = parsed;
            }
          }
          return {
            text: request.text,
            speaker,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          audio: await toReadableStream(response),
          extra: { response },
        }),
      },
    };
    return transformer;
  })(),
}