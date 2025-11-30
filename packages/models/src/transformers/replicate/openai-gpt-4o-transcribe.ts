import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    prompt?: string | null;
    language?: string | null;
    audio_file: string;
    temperature?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "openai/gpt-4o-transcribe": (() => {
    const transformer: ReplicateTransformer = {
      transcribe: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          audio_file: await toURL(request.audio),
          prompt: request.prompt,
          language: request.language,
          temperature: request.temperature,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          text: response.join(""),
        }),
        parseChunk: async (chunk: any, ctx) => ({
          delta: chunk,
          text: chunk,
        }),
      },
    };
    return transformer;
  })(),
}