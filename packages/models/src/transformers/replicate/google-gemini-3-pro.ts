import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    audio?: string | null;
    top_p?: number;
    images?: string[];
    prompt: string;
    videos?: string[];
    temperature?: number;
    thinking_level?: Schemas["thinking_level"] | null;
    max_output_tokens?: number;
    system_instruction?: string | null;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  thinking_level: "low" | "high";
};

export default {
  "google/gemini-3-pro": (() => {
    const transformer: ReplicateTransformer = {
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let prompt = "";
          const images: string[] = [];
          const videos: string[] = [];
          let audio: string | undefined;
          let system_instruction: string | undefined;

          for (const message of request.messages) {
            if (message.role === 'system') {
              system_instruction = typeof message.content === 'string' ? message.content : "";
              continue;
            }

            if (typeof message.content === 'string') {
              prompt += `${message.role}: ${message.content}\n`;
            } else {
              prompt += `${message.role}: `;
              for (const part of message.content) {
                if (part.type === 'text') {
                  prompt += part.content;
                } else if (part.type === 'image') {
                  images.push(await toURL(part.content));
                } else if (part.type === 'audio') {
                  // Model only supports one audio file, taking the last one found
                  audio = await toURL(part.content);
                } else if (part.type === 'file') {
                  // Assuming generic files are videos for this model context
                  videos.push(await toURL(part.content));
                }
              }
              prompt += "\n";
            }
          }

          let thinking_level: Schemas["thinking_level"] | undefined;
          if (request.reason?.effort) {
            thinking_level = request.reason.effort === 'low' ? 'low' : 'high';
          }

          return {
            prompt,
            images: images.length > 0 ? images : undefined,
            videos: videos.length > 0 ? videos : undefined,
            audio: audio || undefined,
            system_instruction,
            temperature: request.temperature,
            top_p: request.topP,
            max_output_tokens: request.maxTokens,
            thinking_level,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            content: response.join(''),
            finishReason: 'stop',
          };
        },
        parseChunk: async (chunk: string, ctx) => {
          return {
            content: chunk,
          };
        },
      },
    };
    return transformer;
  })(),
}