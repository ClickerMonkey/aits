import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    file?: string;
    prompt?: string;
    file_url?: string;
    hf_token?: string;
    language?: string;
    translate?: boolean;
    batch_size?: number;
    file_string?: string;
    num_speakers?: number;
    group_segments?: boolean;
    offset_seconds?: number;
    transcript_output_format?: Schemas["transcript_output_format"];
  };
  Output: {
    language?: string;
    segments: unknown[];
    num_speakers?: number;
  };
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  transcript_output_format: "words_only" | "segments_only" | "both";
};

export default {
  "nicknaskida/whisper-diarization": (() => {
    const transformer: ReplicateTransformer = {
      transcribe: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          return {
            file: await toURL(request.audio),
            prompt: request.prompt,
            language: request.language,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          // Concatenate segment texts to form the full transcript
          const text = response.segments 
            ? response.segments.map((s: any) => s.text || '').join(' ').trim()
            : '';
            
          return {
            text,
          };
        },
      },
    };
    return transformer;
  })(),
}