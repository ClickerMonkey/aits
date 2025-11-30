import { toReadableStream, toStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    prompt?: string;
    description?: string;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "cjwbw/parler-tts": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx) => ({
          prompt: request.text,
          description: request.instructions,
          ...request.extra,
        }),
        parseResponse: async (response, ctx) => ({
          audio: await toReadableStream(response),
        }),
      },
    };
    return transformer;
  })(),
}