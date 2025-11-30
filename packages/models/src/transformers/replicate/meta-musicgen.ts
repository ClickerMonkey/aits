import { toURL, toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    top_k?: number;
    top_p?: number;
    prompt?: string;
    duration?: number;
    input_audio?: string;
    temperature?: number;
    continuation?: boolean;
    model_version?: Schemas["model_version"];
    output_format?: Schemas["output_format"];
    continuation_end?: number;
    continuation_start?: number;
    multi_band_diffusion?: boolean;
    normalization_strategy?: Schemas["normalization_strategy"];
    classifier_free_guidance?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  model_version: "stereo-melody-large" | "stereo-large" | "melody-large" | "large";
  output_format: "wav" | "mp3";
  normalization_strategy: "loudness" | "clip" | "peak" | "rms";
};

export default {
  "meta/musicgen": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: Schemas["Input"] = {
            prompt: request.text,
            output_format: request.responseFormat as Schemas["output_format"],
            ...(request.extra || {}),
          };
          if (request.extra?.input_audio) {
            input.input_audio = await toURL(request.extra.input_audio);
          }
          return input;
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