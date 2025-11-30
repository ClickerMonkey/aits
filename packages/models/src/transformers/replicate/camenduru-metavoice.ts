import { toURL, toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    text?: string;
    input_audio: string;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "camenduru/metavoice": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          text: request.text,
          input_audio: request.voice ? await toURL(request.voice) : (request.extra?.input_audio as string),
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          audio: await toReadableStream(response),
        }),
      },
    };
    return transformer;
  })(),
}