import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    model?: Schemas["model"];
    accuracy?: number;
    voice_file: string;
    need_noise_reduction?: boolean;
    need_volume_normalization?: boolean;
  };
  model: "speech-2.6-turbo" | "speech-2.6-hd" | "speech-02-turbo" | "speech-02-hd";
  Output: Schemas["VoiceCloningOutputs"];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  VoiceCloningOutputs: {
    model: string;
    preview: string;
    voice_id: string;
  };
};

export default {
  "minimax/voice-cloning": (() => {
    const transformer: ReplicateTransformer = {
      transcribe: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          voice_file: await toURL(request.audio),
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          text: response.voice_id,
        }),
      },
    };
    return transformer;
  })(),
}