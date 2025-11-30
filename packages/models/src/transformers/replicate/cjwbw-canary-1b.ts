import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';



export default {
  "cjwbw/canary-1b": (() => {
    const transformer: ReplicateTransformer = {
      transcribe: {
        convertRequest: async (request, ctx) => ({
          audio: await toURL(request.audio),
          tgt_language: request.language,
          audio_language: request.language,
          ...request.extra,
        }),
        parseResponse: async (response, ctx) => ({
          text: response,
        }),
      },
    };
    return transformer;
  })()
}