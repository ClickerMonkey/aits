import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number | null;
    pitch?: Schemas["pitch"];
    voice?: Schemas["voice"];
    prompt: string;
    temperature?: number;
    custom_voice?: string | null;
    exaggeration?: number;
  };
  pitch: "x-low" | "low" | "medium" | "high" | "x-high";
  voice: "Luna" | "Ember" | "Hem" | "Aurora" | "Cliff" | "Josh" | "William (Whispering)" | "Orion" | "Ken";
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "resemble-ai/chatterbox-pro": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.text,
          voice: request.voice as Schemas["voice"] | undefined,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          audio: await toReadableStream(response),
          extra: { response },
        }),
      },
    };
    return transformer;
  })(),
}