import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    format?: Schemas["format"];
    audio_path: string;
    model_name?: Schemas["model_name"];
  };
  Output: Schemas["ModelOutput"];
  Status: "processing" | "succeeded" | "failed";
  format: "srt" | "vtt";
  Request: {
    input?: Schemas["Input"];
    output_file_prefix?: string;
  };
  Response: {
    error?: string;
    output?: Schemas["Output"];
    status: Schemas["Status"];
  };
  model_name: "tiny.en" | "tiny" | "base.en" | "base" | "small.en" | "small" | "medium.en" | "medium" | "large";
  ModelOutput: {
    text: string;
    language: string;
    subtitles: string;
  };
};

export default { 
  "m1guelpf/whisper-subtitles": (() => {
    const transformer: ReplicateTransformer = { 
      transcribe: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          audio_path: await toURL(request.audio),
          format: (request.responseFormat === 'srt' || request.responseFormat === 'vtt') ? request.responseFormat : undefined,
          model_name: request.extra?.model_name,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          text: response.subtitles || response.text,
        }),
      },
    };
    return transformer;
  })(),
}