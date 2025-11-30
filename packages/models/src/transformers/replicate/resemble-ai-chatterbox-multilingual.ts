import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    text: string;
    language?: Schemas["language"];
    cfg_weight?: number;
    temperature?: number;
    exaggeration?: number;
    reference_audio?: string | null;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  language: "ar" | "da" | "de" | "el" | "en" | "es" | "fi" | "fr" | "he" | "hi" | "it" | "ja" | "ko" | "ms" | "nl" | "no" | "pl" | "pt" | "ru" | "sv" | "sw" | "tr" | "zh";
};

export default {
  "resemble-ai/chatterbox-multilingual": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          return {
            text: request.text,
            language: request.voice as Schemas["language"],
            seed: request.extra?.seed,
            cfg_weight: request.extra?.cfg_weight,
            temperature: request.extra?.temperature,
            exaggeration: request.extra?.exaggeration,
            reference_audio: request.extra?.reference_audio,
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