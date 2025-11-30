import { toURL, toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  task: "speech_editing-substitution" | "speech_editing-insertion" | "speech_editing-deletion" | "zero-shot text-to-speech";
  Input: {
    seed?: number;
    task?: Schemas["task"];
    top_p?: number;
    kvcache?: Schemas["kvcache"];
    orig_audio: string;
    cut_off_sec?: number;
    left_margin?: number;
    temperature?: number;
    right_margin?: number;
    whisperx_model?: Schemas["whisperx_model"];
    orig_transcript?: string;
    stop_repetition?: number;
    voicecraft_model?: Schemas["voicecraft_model"];
    sample_batch_size?: number;
    target_transcript: string;
  };
  Output: Schemas["ModelOutput"];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  kvcache: 0 | 1;
  ModelOutput: {
    generated_audio?: string;
    whisper_transcript_orig_audio: string;
  };
  whisperx_model: "base.en" | "small.en" | "medium.en";
  voicecraft_model: "giga830M.pth" | "giga330M.pth" | "giga330M_TTSEnhanced.pth";
};

export default { 
  "cjwbw/voicecraft": (() => {
    const transformer: ReplicateTransformer = { 
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const orig_audio = request.voice 
            ? request.voice 
            : (request.extra?.orig_audio ? await toURL(request.extra.orig_audio) : undefined);

          if (!orig_audio) {
            throw new Error("orig_audio is required. Provide it via the 'voice' parameter or 'extra.orig_audio'.");
          }

          return { 
            target_transcript: request.text,
            orig_audio,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          if (!response.generated_audio) throw new Error("No audio generated");
          return {
            audio: await toReadableStream(response.generated_audio),
          };
        },
      },
    };
    return transformer;
  })(), 
}