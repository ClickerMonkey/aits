import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    steps?: number;
    prompt?: string;
    model_version?: Schemas["model_version"];
    guidance_scale?: number;
    negative_prompt?: string;
    save_spectrogram?: boolean;
  };
  Output: {
    wav: string;
    melspectrogram?: string;
  };
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  model_version: "small" | "base" | "large" | "giant";
};

export default {
  "zsxkib/flux-music": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.text,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          audio: await toReadableStream(response.wav),
        }),
      },
    };
    return transformer;
  })(),
}