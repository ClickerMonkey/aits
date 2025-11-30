import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    prompt?: string;
    text_temp?: number;
    output_full?: boolean;
    waveform_temp?: number;
    history_prompt?: Schemas["history_prompt"];
    custom_history_prompt?: string;
  };
  Output: Schemas["ModelOutput"];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  ModelOutput: {
    audio_out: string;
    prompt_npz?: string;
  };
  history_prompt: "announcer" | "de_speaker_0" | "de_speaker_1" | "de_speaker_2" | "de_speaker_3" | "de_speaker_4" | "de_speaker_5" | "de_speaker_6" | "de_speaker_7" | "de_speaker_8" | "de_speaker_9" | "en_speaker_0" | "en_speaker_1" | "en_speaker_2" | "en_speaker_3" | "en_speaker_4" | "en_speaker_5" | "en_speaker_6" | "en_speaker_7" | "en_speaker_8" | "en_speaker_9" | "es_speaker_0" | "es_speaker_1" | "es_speaker_2" | "es_speaker_3" | "es_speaker_4" | "es_speaker_5" | "es_speaker_6" | "es_speaker_7" | "es_speaker_8" | "es_speaker_9" | "fr_speaker_0" | "fr_speaker_1" | "fr_speaker_2" | "fr_speaker_3" | "fr_speaker_4" | "fr_speaker_5" | "fr_speaker_6" | "fr_speaker_7" | "fr_speaker_8" | "fr_speaker_9" | "hi_speaker_0" | "hi_speaker_1" | "hi_speaker_2" | "hi_speaker_3" | "hi_speaker_4" | "hi_speaker_5" | "hi_speaker_6" | "hi_speaker_7" | "hi_speaker_8" | "hi_speaker_9" | "it_speaker_0" | "it_speaker_1" | "it_speaker_2" | "it_speaker_3" | "it_speaker_4" | "it_speaker_5" | "it_speaker_6" | "it_speaker_7" | "it_speaker_8" | "it_speaker_9" | "ja_speaker_0" | "ja_speaker_1" | "ja_speaker_2" | "ja_speaker_3" | "ja_speaker_4" | "ja_speaker_5" | "ja_speaker_6" | "ja_speaker_7" | "ja_speaker_8" | "ja_speaker_9" | "ko_speaker_0" | "ko_speaker_1" | "ko_speaker_2" | "ko_speaker_3" | "ko_speaker_4" | "ko_speaker_5" | "ko_speaker_6" | "ko_speaker_7" | "ko_speaker_8" | "ko_speaker_9" | "pl_speaker_0" | "pl_speaker_1" | "pl_speaker_2" | "pl_speaker_3" | "pl_speaker_4" | "pl_speaker_5" | "pl_speaker_6" | "pl_speaker_7" | "pl_speaker_8" | "pl_speaker_9" | "pt_speaker_0" | "pt_speaker_1" | "pt_speaker_2" | "pt_speaker_3" | "pt_speaker_4" | "pt_speaker_5" | "pt_speaker_6" | "pt_speaker_7" | "pt_speaker_8" | "pt_speaker_9" | "ru_speaker_0" | "ru_speaker_1" | "ru_speaker_2" | "ru_speaker_3" | "ru_speaker_4" | "ru_speaker_5" | "ru_speaker_6" | "ru_speaker_7" | "ru_speaker_8" | "ru_speaker_9" | "tr_speaker_0" | "tr_speaker_1" | "tr_speaker_2" | "tr_speaker_3" | "tr_speaker_4" | "tr_speaker_5" | "tr_speaker_6" | "tr_speaker_7" | "tr_speaker_8" | "tr_speaker_9" | "zh_speaker_0" | "zh_speaker_1" | "zh_speaker_2" | "zh_speaker_3" | "zh_speaker_4" | "zh_speaker_5" | "zh_speaker_6" | "zh_speaker_7" | "zh_speaker_8" | "zh_speaker_9";
};

export default {
  "suno-ai/bark": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.text,
          history_prompt: request.voice as Schemas["history_prompt"],
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          audio: await toReadableStream(response.audio_out),
        }),
      },
    };
    return transformer;
  })(),
}