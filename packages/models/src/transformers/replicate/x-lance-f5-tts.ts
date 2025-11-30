import { toURL, toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    speed?: number;
    gen_text: string;
    ref_text?: string;
    ref_audio: string;
    remove_silence?: boolean;
    custom_split_words?: string;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "x-lance/f5-tts": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const ref_audio = request.voice 
            ? await toURL(request.voice) 
            : (request.extra?.ref_audio ? await toURL(request.extra.ref_audio) : undefined);

          if (!ref_audio) {
            throw new Error("ref_audio is required for x-lance/f5-tts. Please provide it via 'voice' or 'extra.ref_audio'.");
          }

          return {
            gen_text: request.text,
            ref_audio,
            speed: request.speed,
            ref_text: request.extra?.ref_text,
            remove_silence: request.extra?.remove_silence,
            custom_split_words: request.extra?.custom_split_words,
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