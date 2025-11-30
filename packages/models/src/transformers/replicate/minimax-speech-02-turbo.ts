import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    text: string;
    pitch?: number;
    speed?: number;
    volume?: number;
    bitrate?: Schemas["bitrate"];
    channel?: Schemas["channel"];
    emotion?: Schemas["emotion"];
    voice_id?: string;
    sample_rate?: Schemas["sample_rate"];
    audio_format?: Schemas["audio_format"];
    language_boost?: Schemas["language_boost"];
    subtitle_enable?: boolean;
    english_normalization?: boolean;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  bitrate: 32000 | 64000 | 128000 | 256000;
  channel: "mono" | "stereo";
  emotion: "auto" | "happy" | "sad" | "angry" | "fearful" | "disgusted" | "surprised" | "calm" | "fluent" | "neutral";
  sample_rate: 8000 | 16000 | 22050 | 24000 | 32000 | 44100;
  audio_format: "mp3" | "wav" | "flac" | "pcm";
  language_boost: "None" | "Automatic" | "Chinese" | "Chinese,Yue" | "Cantonese" | "English" | "Arabic" | "Russian" | "Spanish" | "French" | "Portuguese" | "German" | "Turkish" | "Dutch" | "Ukrainian" | "Vietnamese" | "Indonesian" | "Japanese" | "Italian" | "Korean" | "Thai" | "Polish" | "Romanian" | "Greek" | "Czech" | "Finnish" | "Hindi" | "Bulgarian" | "Danish" | "Hebrew" | "Malay" | "Persian" | "Slovak" | "Swedish" | "Croatian" | "Filipino" | "Hungarian" | "Norwegian" | "Slovenian" | "Catalan" | "Nynorsk" | "Tamil" | "Afrikaans";
};

export default {
  "minimax/speech-02-turbo": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          return {
            text: request.text,
            voice_id: request.voice,
            speed: request.speed,
            audio_format: request.responseFormat !== 'opus' && request.responseFormat !== 'aac' ? request.responseFormat : 'mp3',
            ...request.extra,
          };
        },
        parseResponse: async (response, ctx) => {
          return {
            audio: await toReadableStream(response),
            extra: { response },
          };
        },
      },
    };
    return transformer;
  })()
}