import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  task: "transcribe" | "translate";
  Input: {
    task?: Schemas["task"];
    audio: string;
    hf_token?: string;
    language?: Schemas["language"];
    timestamp?: Schemas["timestamp"];
    batch_size?: number;
    diarise_audio?: boolean;
  };
  Output: unknown;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  language: "None" | "afrikaans" | "albanian" | "amharic" | "arabic" | "armenian" | "assamese" | "azerbaijani" | "bashkir" | "basque" | "belarusian" | "bengali" | "bosnian" | "breton" | "bulgarian" | "cantonese" | "catalan" | "chinese" | "croatian" | "czech" | "danish" | "dutch" | "english" | "estonian" | "faroese" | "finnish" | "french" | "galician" | "georgian" | "german" | "greek" | "gujarati" | "haitian creole" | "hausa" | "hawaiian" | "hebrew" | "hindi" | "hungarian" | "icelandic" | "indonesian" | "italian" | "japanese" | "javanese" | "kannada" | "kazakh" | "khmer" | "korean" | "lao" | "latin" | "latvian" | "lingala" | "lithuanian" | "luxembourgish" | "macedonian" | "malagasy" | "malay" | "malayalam" | "maltese" | "maori" | "marathi" | "mongolian" | "myanmar" | "nepali" | "norwegian" | "nynorsk" | "occitan" | "pashto" | "persian" | "polish" | "portuguese" | "punjabi" | "romanian" | "russian" | "sanskrit" | "serbian" | "shona" | "sindhi" | "sinhala" | "slovak" | "slovenian" | "somali" | "spanish" | "sundanese" | "swahili" | "swedish" | "tagalog" | "tajik" | "tamil" | "tatar" | "telugu" | "thai" | "tibetan" | "turkish" | "turkmen" | "ukrainian" | "urdu" | "uzbek" | "vietnamese" | "welsh" | "yiddish" | "yoruba";
  timestamp: "chunk" | "word";
};

export default {
  "vaibhavs10/incredibly-fast-whisper": (() => {
    const transformer: ReplicateTransformer = {
      transcribe: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: Schemas["Input"] = {
            audio: await toURL(request.audio),
            ...request.extra,
          };
          if (request.language) {
            input.language = request.language as Schemas["language"];
          }
          if (request.timestampGranularities?.includes('word')) {
            input.timestamp = 'word';
          }
          return input;
        },
        parseResponse: async (response: any, ctx) => ({
          text: response.text,
        }),
      },
    };
    return transformer;
  })(),
}