import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    text: string;
    language?: Schemas["language"];
  };
  Output: string;
  language: "en" | "es" | "fr" | "de" | "it" | "pl" | "uk" | "nl" | "ro" | "hu" | "el" | "cs" | "sv" | "pt" | "bg" | "hr" | "da" | "sk" | "fi" | "lt" | "sl" | "lv" | "et" | "ga" | "mt";
};

export default {
  "awerks/neon-tts": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          text: request.text,
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