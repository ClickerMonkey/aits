import { toURL, toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    text?: string;
    audio: string;
    speed?: number;
    language?: Schemas["language"];
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  language: "EN_NEWEST" | "EN" | "ES" | "FR" | "ZH" | "JP" | "KR";
};

export default {
  "chenxwh/openvoice": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          if (!request.voice) {
            throw new Error("Voice (audio reference) is required for this model");
          }
          return {
            text: request.text,
            audio: await toURL(request.voice),
            speed: request.speed,
            language: request.extra?.language,
            ...(request.extra || {}),
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
  })()
}