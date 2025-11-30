import { toURL, toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    text?: string;
    speaker: string;
    language?: Schemas["language"];
    cleanup_voice?: boolean;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  language: "en" | "es" | "fr" | "de" | "it" | "pt" | "pl" | "tr" | "ru" | "nl" | "cs" | "ar" | "zh" | "hu" | "ko" | "hi";
};

export default {
  "lucataco/xtts-v2": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const speaker = request.voice || request.extra?.speaker;
          if (!speaker) {
            throw new Error("Speaker audio URL is required for this model. Please provide it via 'voice' or 'extra.speaker'.");
          }
          return {
            text: request.text,
            speaker: await toURL(speaker),
            language: request.extra?.language,
            cleanup_voice: request.extra?.cleanup_voice,
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