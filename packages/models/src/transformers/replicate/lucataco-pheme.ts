import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    top_k?: number;
    voice?: Schemas["voice"];
    prompt?: string;
    temperature?: number;
  };
  voice: "male_voice" | "POD0000004393_S0000029" | "POD0000007005_S0000568" | "POD0000009720_S0000244" | "POD0000014360_S0000082" | "POD0000015908_S0000037";
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "lucataco/pheme": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.text,
          voice: request.voice as Schemas["voice"],
          temperature: request.extra?.temperature,
          top_k: request.extra?.top_k,
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