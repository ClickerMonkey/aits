import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    file?: string;
    prompt?: string;
    file_url?: string;
    language?: string;
    translate?: boolean;
    file_string?: string;
    num_speakers?: number;
    group_segments?: boolean;
  };
  Output: {
    language?: string;
    segments: unknown[];
    num_speakers?: number;
  };
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "thomasmol/whisper-diarization": (() => {
    const transformer: ReplicateTransformer = {
      transcribe: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          file: await toURL(request.audio),
          prompt: request.prompt,
          language: request.language,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => {
          const text = Array.isArray(response.segments)
            ? response.segments.map((s: any) => s.text || "").join(" ").trim()
            : "";
          return {
            text,
          };
        },
      },
    };
    return transformer;
  })(),
}