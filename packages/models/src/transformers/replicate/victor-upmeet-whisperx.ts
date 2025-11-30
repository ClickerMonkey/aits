import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    debug?: boolean;
    language?: string;
    vad_onset?: number;
    audio_file: string;
    batch_size?: number;
    vad_offset?: number;
    diarization?: boolean;
    temperature?: number;
    align_output?: boolean;
    max_speakers?: number;
    min_speakers?: number;
    initial_prompt?: string;
    huggingface_access_token?: string;
    language_detection_min_prob?: number;
    language_detection_max_tries?: number;
  };
  Output: {
    segments?: unknown;
    detected_language: string;
  };
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "victor-upmeet/whisperx": (() => {
    const transformer: ReplicateTransformer = {
      transcribe: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          audio_file: await toURL(request.audio),
          language: request.language,
          initial_prompt: request.prompt,
          temperature: request.temperature,
          align_output: request.timestampGranularities?.includes('word'),
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => {
          const segments = (response.segments as Array<{ text: string }>) || [];
          return {
            text: segments.map((s) => s.text.trim()).join(' '),
          };
        },
      },
    };
    return transformer;
  })(),
}