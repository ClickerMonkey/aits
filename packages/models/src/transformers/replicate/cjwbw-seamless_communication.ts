import { toURL, toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    task_name?: Schemas["task_name"];
    input_text?: string;
    input_audio?: string;
    input_text_language?: Schemas["input_text_language"];
    max_input_audio_length?: number;
    target_language_text_only?: Schemas["target_language_text_only"];
    target_language_with_speech?: Schemas["target_language_with_speech"];
  };
  Output: Schemas["ModelOutput"];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  task_name: "S2ST (Speech to Speech translation)" | "S2TT (Speech to Text translation)" | "T2ST (Text to Speech translation)" | "T2TT (Text to Text translation)" | "ASR (Automatic Speech Recognition)";
  ModelOutput: {
    text_output: string;
    audio_output?: string;
  };
  input_text_language: "None" | "Afrikaans" | "Amharic" | "Armenian" | "Assamese" | "Basque" | "Belarusian" | "Bengali" | "Bosnian" | "Bulgarian" | "Burmese" | "Cantonese" | "Catalan" | "Cebuano" | "Central Kurdish" | "Croatian" | "Czech" | "Danish" | "Dutch" | "Egyptian Arabic" | "English" | "Estonian" | "Finnish" | "French" | "Galician" | "Ganda" | "Georgian" | "German" | "Greek" | "Gujarati" | "Halh Mongolian" | "Hebrew" | "Hindi" | "Hungarian" | "Icelandic" | "Igbo" | "Indonesian" | "Irish" | "Italian" | "Japanese" | "Javanese" | "Kannada" | "Kazakh" | "Khmer" | "Korean" | "Kyrgyz" | "Lao" | "Lithuanian" | "Luo" | "Macedonian" | "Maithili" | "Malayalam" | "Maltese" | "Mandarin Chinese" | "Marathi" | "Meitei" | "Modern Standard Arabic" | "Moroccan Arabic" | "Nepali" | "North Azerbaijani" | "Northern Uzbek" | "Norwegian Bokmål" | "Norwegian Nynorsk" | "Nyanja" | "Odia" | "Polish" | "Portuguese" | "Punjabi" | "Romanian" | "Russian" | "Serbian" | "Shona" | "Sindhi" | "Slovak" | "Slovenian" | "Somali" | "Southern Pashto" | "Spanish" | "Standard Latvian" | "Standard Malay" | "Swahili" | "Swedish" | "Tagalog" | "Tajik" | "Tamil" | "Telugu" | "Thai" | "Turkish" | "Ukrainian" | "Urdu" | "Vietnamese" | "Welsh" | "West Central Oromo" | "Western Persian" | "Yoruba" | "Zulu";
  target_language_text_only: "Afrikaans" | "Amharic" | "Armenian" | "Assamese" | "Basque" | "Belarusian" | "Bengali" | "Bosnian" | "Bulgarian" | "Burmese" | "Cantonese" | "Catalan" | "Cebuano" | "Central Kurdish" | "Croatian" | "Czech" | "Danish" | "Dutch" | "Egyptian Arabic" | "English" | "Estonian" | "Finnish" | "French" | "Galician" | "Ganda" | "Georgian" | "German" | "Greek" | "Gujarati" | "Halh Mongolian" | "Hebrew" | "Hindi" | "Hungarian" | "Icelandic" | "Igbo" | "Indonesian" | "Irish" | "Italian" | "Japanese" | "Javanese" | "Kannada" | "Kazakh" | "Khmer" | "Korean" | "Kyrgyz" | "Lao" | "Lithuanian" | "Luo" | "Macedonian" | "Maithili" | "Malayalam" | "Maltese" | "Mandarin Chinese" | "Marathi" | "Meitei" | "Modern Standard Arabic" | "Moroccan Arabic" | "Nepali" | "North Azerbaijani" | "Northern Uzbek" | "Norwegian Bokmål" | "Norwegian Nynorsk" | "Nyanja" | "Odia" | "Polish" | "Portuguese" | "Punjabi" | "Romanian" | "Russian" | "Serbian" | "Shona" | "Sindhi" | "Slovak" | "Slovenian" | "Somali" | "Southern Pashto" | "Spanish" | "Standard Latvian" | "Standard Malay" | "Swahili" | "Swedish" | "Tagalog" | "Tajik" | "Tamil" | "Telugu" | "Thai" | "Turkish" | "Ukrainian" | "Urdu" | "Vietnamese" | "Welsh" | "West Central Oromo" | "Western Persian" | "Yoruba" | "Zulu";
  target_language_with_speech: "Bengali" | "Catalan" | "Czech" | "Danish" | "Dutch" | "English" | "Estonian" | "Finnish" | "French" | "German" | "Hindi" | "Indonesian" | "Italian" | "Japanese" | "Korean" | "Maltese" | "Mandarin Chinese" | "Modern Standard Arabic" | "Northern Uzbek" | "Polish" | "Portuguese" | "Romanian" | "Russian" | "Slovak" | "Spanish" | "Swahili" | "Swedish" | "Tagalog" | "Telugu" | "Thai" | "Turkish" | "Ukrainian" | "Urdu" | "Vietnamese" | "Welsh" | "Western Persian";
};

export default {
  "cjwbw/seamless_communication": (() => {
    const transformer: ReplicateTransformer = {
      transcribe: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          input_audio: await toURL(request.audio),
          task_name: (request.extra?.task_name as Schemas["task_name"]) || "ASR (Automatic Speech Recognition)",
          target_language_text_only: (request.language as Schemas["target_language_text_only"]) || request.extra?.target_language_text_only,
          max_input_audio_length: request.extra?.max_input_audio_length,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          text: response.text_output,
        }),
      },
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          input_text: request.text,
          task_name: "T2ST (Text to Speech translation)",
          target_language_with_speech: request.extra?.language as Schemas["target_language_with_speech"],
          input_text_language: request.extra?.input_text_language as Schemas["input_text_language"],
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => {
          if (!response.audio_output) throw new Error("No audio output received from model");
          return {
            audio: await toReadableStream(response.audio_output),
          };
        },
      },
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const lastMessage = request.messages[request.messages.length - 1];
          let text = "";
          if (typeof lastMessage.content === "string") {
            text = lastMessage.content;
          } else {
            text = lastMessage.content
              .filter((c) => c.type === "text")
              .map((c) => c.content)
              .join("\n");
          }
          return {
            input_text: text,
            task_name: "T2TT (Text to Text translation)",
            target_language_text_only: request.extra?.language as Schemas["target_language_text_only"],
            input_text_language: request.extra?.input_text_language as Schemas["input_text_language"],
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          content: response.text_output,
          finishReason: "stop",
        }),
      },
    };
    return transformer;
  })(),
}