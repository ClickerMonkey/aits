import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    lyrics?: string;
    bitrate?: Schemas["bitrate"];
    voice_id?: string;
    song_file?: string;
    voice_file?: string;
    sample_rate?: Schemas["sample_rate"];
    instrumental_id?: string;
    instrumental_file?: string;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  bitrate: 32000 | 64000 | 128000 | 256000;
  sample_rate: 16000 | 24000 | 32000 | 44100;
};

export default {
  "minimax/music-01": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          lyrics: request.text,
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