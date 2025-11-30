import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    audio: string;
    debug?: boolean;
    only_text?: boolean;
    batch_size?: number;
    align_output?: boolean;
  };
  Output: unknown;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "daanelson/whisperx": (() => {
    const transformer: ReplicateTransformer = { 
      transcribe: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          audio: await toURL(request.audio),
          batch_size: request.extra?.batch_size,
          align_output: request.timestampGranularities?.includes('word') ?? request.extra?.align_output,
          only_text: request.responseFormat === 'text' ? true : request.extra?.only_text,
          debug: request.extra?.debug,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => {
          let text = '';
          if (Array.isArray(response)) {
            text = response.map((segment: any) => segment.text).join('').trim();
          } else if (typeof response === 'object' && response && 'text' in response) {
            text = (response as any).text;
          }
          return { text };
        },
      },
    };
    return transformer;
  })()
}