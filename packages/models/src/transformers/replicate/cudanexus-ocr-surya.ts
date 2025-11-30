import { toURL, toText } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    action?: Schemas["action"];
    page_number?: number;
    languages_input?: string;
    languages_choices?: Schemas["languages_choices"];
  };
  Output: {
    image: string;
    Status?: string;
    text_file?: string;
  };
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  action: "Run Text Detection" | "Run OCR";
  languages_choices: "Afrikaans" | "Albanian" | "Amharic" | "Arabic" | "Armenian" | "Assamese" | "Azerbaijani" | "Basque" | "Belarusian" | "Bengali" | "Bosnian" | "Breton" | "Bulgarian" | "Burmese" | "Catalan" | "Chinese" | "Croatian" | "Czech" | "Danish" | "Dutch" | "English" | "Esperanto" | "Estonian" | "Finnish" | "French" | "Galician" | "Georgian" | "German" | "Greek" | "Gujarati" | "Hausa" | "Hebrew" | "Hindi" | "Hungarian" | "Icelandic" | "Indonesian" | "Irish" | "Italian" | "Japanese" | "Javanese" | "Kannada" | "Kazakh" | "Khmer" | "Korean" | "Kurdish" | "Kyrgyz" | "Lao" | "Latin" | "Latvian" | "Lithuanian" | "Macedonian" | "Malagasy" | "Malay" | "Malayalam" | "Marathi" | "Mongolian" | "Nepali" | "Norwegian" | "Oriya" | "Oromo" | "Pashto" | "Persian" | "Polish" | "Portuguese" | "Punjabi" | "Romanian" | "Russian" | "Sanskrit" | "Scottish Gaelic" | "Serbian" | "Sindhi" | "Sinhala" | "Slovak" | "Slovenian" | "Somali" | "Spanish" | "Sundanese" | "Swahili" | "Swedish" | "Tagalog" | "Tamil" | "Telugu" | "Thai" | "Turkish" | "Ukrainian" | "Urdu" | "Uyghur" | "Uzbek" | "Vietnamese" | "Welsh" | "Western Frisian" | "Xhosa" | "Yiddish";
};

export default {
  "cudanexus/ocr-surya": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.images[0]),
          languages_input: request.prompt,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => {
          let content = "";
          if (response.text_file) {
            content = await toText(response.text_file);
          }
          return {
            content,
            finishReason: "stop",
          };
        },
      },
    };
    return transformer;
  })()
}