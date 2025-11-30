import { toURL, toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    gen_text: string;
    ref_text: string;
    ref_audio: string;
    remove_silence?: boolean;
    custom_split_words?: string;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "fermatresearch/spanish-f5-tts": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const extra = request.extra ?? {};
          return {
            gen_text: request.text,
            ref_text: extra.ref_text,
            ref_audio: await toURL(extra.ref_audio),
            remove_silence: extra.remove_silence,
            custom_split_words: extra.custom_split_words,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          audio: await toReadableStream(response),
        }),
      },
    };
    return transformer;
  })(),
}