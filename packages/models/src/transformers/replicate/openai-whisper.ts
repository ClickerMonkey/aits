import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    audio: string;
    language?: Schemas["language"];
    patience?: number;
    translate?: boolean;
    temperature?: number;
    transcription?: Schemas["transcription"];
    initial_prompt?: string;
    suppress_tokens?: string;
    logprob_threshold?: number;
    no_speech_threshold?: number;
    condition_on_previous_text?: boolean;
    compression_ratio_threshold?: number;
    temperature_increment_on_fallback?: number;
  };
  Output: {
    segments?: unknown;
    srt_file?: string;
    txt_file?: string;
    translation?: string;
    transcription: string;
    detected_language: string;
  };
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  language: "auto" | "af" | "am" | "ar" | "as" | "az" | "ba" | "be" | "bg" | "bn" | "bo" | "br" | "bs" | "ca" | "cs" | "cy" | "da" | "de" | "el" | "en" | "es" | "et" | "eu" | "fa" | "fi" | "fo" | "fr" | "gl" | "gu" | "ha" | "haw" | "he" | "hi" | "hr" | "ht" | "hu" | "hy" | "id" | "is" | "it" | "ja" | "jw" | "ka" | "kk" | "km" | "kn" | "ko" | "la" | "lb" | "ln" | "lo" | "lt" | "lv" | "mg" | "mi" | "mk" | "ml" | "mn" | "mr" | "ms" | "mt" | "my" | "ne" | "nl" | "nn" | "no" | "oc" | "pa" | "pl" | "ps" | "pt" | "ro" | "ru" | "sa" | "sd" | "si" | "sk" | "sl" | "sn" | "so" | "sq" | "sr" | "su" | "sv" | "sw" | "ta" | "te" | "tg" | "th" | "tk" | "tl" | "tr" | "tt" | "uk" | "ur" | "uz" | "vi" | "yi" | "yo" | "yue" | "zh" | "Afrikaans" | "Albanian" | "Amharic" | "Arabic" | "Armenian" | "Assamese" | "Azerbaijani" | "Bashkir" | "Basque" | "Belarusian" | "Bengali" | "Bosnian" | "Breton" | "Bulgarian" | "Burmese" | "Cantonese" | "Castilian" | "Catalan" | "Chinese" | "Croatian" | "Czech" | "Danish" | "Dutch" | "English" | "Estonian" | "Faroese" | "Finnish" | "Flemish" | "French" | "Galician" | "Georgian" | "German" | "Greek" | "Gujarati" | "Haitian" | "Haitian Creole" | "Hausa" | "Hawaiian" | "Hebrew" | "Hindi" | "Hungarian" | "Icelandic" | "Indonesian" | "Italian" | "Japanese" | "Javanese" | "Kannada" | "Kazakh" | "Khmer" | "Korean" | "Lao" | "Latin" | "Latvian" | "Letzeburgesch" | "Lingala" | "Lithuanian" | "Luxembourgish" | "Macedonian" | "Malagasy" | "Malay" | "Malayalam" | "Maltese" | "Mandarin" | "Maori" | "Marathi" | "Moldavian" | "Moldovan" | "Mongolian" | "Myanmar" | "Nepali" | "Norwegian" | "Nynorsk" | "Occitan" | "Panjabi" | "Pashto" | "Persian" | "Polish" | "Portuguese" | "Punjabi" | "Pushto" | "Romanian" | "Russian" | "Sanskrit" | "Serbian" | "Shona" | "Sindhi" | "Sinhala" | "Sinhalese" | "Slovak" | "Slovenian" | "Somali" | "Spanish" | "Sundanese" | "Swahili" | "Swedish" | "Tagalog" | "Tajik" | "Tamil" | "Tatar" | "Telugu" | "Thai" | "Tibetan" | "Turkish" | "Turkmen" | "Ukrainian" | "Urdu" | "Uzbek" | "Valencian" | "Vietnamese" | "Welsh" | "Yiddish" | "Yoruba";
  transcription: "plain text" | "srt" | "vtt";
};

export default {
  "openai/whisper": (() => {
    const transformer: ReplicateTransformer = {
      transcribe: {
        convertRequest: async (request, ctx) => {
          return {
            audio: await toURL(request.audio),
            initial_prompt: request.prompt,
            language: request.language,
            temperature: request.temperature,
            transcription: request.responseFormat === 'srt' ? 'srt' : 
                           request.responseFormat === 'vtt' ? 'vtt' : 'plain text',
            ...request.extra,
          };
        },
        parseResponse: async (response, ctx) => {
          return {
            text: response.transcription || response.translation || "",
          };
        },
      },
    };
    return transformer;
  })(),
}