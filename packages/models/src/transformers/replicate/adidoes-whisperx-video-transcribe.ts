import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    url: string;
    debug?: boolean;
    batch_size?: number;
  };
  Output: string;
};

export default {
  "adidoes/whisperx-video-transcribe": (() => {
    const transformer: ReplicateTransformer = {
      transcribe: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          url: await toURL(request.audio),
          batch_size: request.extra?.batch_size,
          debug: request.extra?.debug,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => {
          try {
            const data = JSON.parse(response);
            const text = data.segments 
              ? data.segments.map((s: any) => s.text).join('').trim() 
              : "";
            return { text };
          } catch (e) {
            return { text: response };
          }
        },
      },
    };
    return transformer;
  })(),
}