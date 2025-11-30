import { toURL, toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    top_k?: number;
    top_p?: number;
    prompt?: string;
    music_input?: string;
    temperature?: number;
    model_version?: Schemas["model_version"];
    output_format?: Schemas["output_format"];
    large_chord_voca?: boolean;
    chroma_coefficient?: number;
    beat_sync_threshold?: number;
    return_instrumental?: boolean;
    multi_band_diffusion?: boolean;
    normalization_strategy?: Schemas["normalization_strategy"];
    classifier_free_guidance?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  model_version: "stereo-chord" | "stereo-chord-large" | "chord" | "chord-large";
  output_format: "wav" | "mp3";
  normalization_strategy: "loudness" | "clip" | "peak" | "rms";
};

export default {
  "sakemin/musicgen-remixer": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const extra = request.extra || {};
          const input: Schemas["Input"] = {
            prompt: request.text,
            ...extra,
          };
          if (extra.music_input) {
            input.music_input = await toURL(extra.music_input);
          }
          if (request.responseFormat === "mp3" || request.responseFormat === "wav") {
            input.output_format = request.responseFormat;
          }
          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            audio: await toReadableStream(response[0]),
          };
        },
      },
    };
    return transformer;
  })(),
}