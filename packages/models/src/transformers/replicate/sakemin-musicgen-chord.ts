import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    bpm?: number;
    seed?: number;
    top_k?: number;
    top_p?: number;
    prompt?: string;
    duration?: number;
    time_sig?: string;
    audio_end?: number;
    audio_start?: number;
    temperature?: number;
    text_chords?: string;
    audio_chords?: string;
    continuation?: boolean;
    output_format?: Schemas["output_format"];
    chroma_coefficient?: number;
    multi_band_diffusion?: boolean;
    normalization_strategy?: Schemas["normalization_strategy"];
    classifier_free_guidance?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  output_format: "wav" | "mp3";
  normalization_strategy: "loudness" | "clip" | "peak" | "rms";
};

export default {
  "sakemin/musicgen-chord": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.text,
          output_format: (request.responseFormat as Schemas["output_format"]) || "wav",
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