import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    text: string;
    top_p?: number;
    voice?: Schemas["voice"];
    temperature?: number;
    max_new_tokens?: number;
    repetition_penalty?: number;
  };
  voice: "tara" | "dan" | "josh" | "emma";
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "lucataco/orpheus-3b-0.1-ft": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          return {
            text: request.text,
            voice: request.voice as Schemas["voice"],
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