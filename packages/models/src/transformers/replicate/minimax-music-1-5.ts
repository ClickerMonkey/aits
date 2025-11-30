import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    lyrics: string;
    prompt: string;
    bitrate?: Schemas["bitrate"];
    sample_rate?: Schemas["sample_rate"];
    audio_format?: Schemas["audio_format"];
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  bitrate: 32000 | 64000 | 128000 | 256000;
  sample_rate: 16000 | 24000 | 32000 | 44100;
  audio_format: "mp3" | "wav" | "pcm";
};

export default {
  "minimax/music-1.5": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          lyrics: request.text,
          prompt: request.instructions ?? "Music",
          audio_format: request.responseFormat as Schemas["audio_format"],
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          audio: await toReadableStream(response),
        }),
      },
    };
    return transformer;
  })()
}