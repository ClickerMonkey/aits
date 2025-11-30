import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    audio_file: string;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "nvidia/parakeet-rnnt-1.1b": (() => {
    const transformer: ReplicateTransformer = {
      transcribe: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          audio_file: await toURL(request.audio),
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          text: response,
        }),
      },
    };
    return transformer;
  })(),
}