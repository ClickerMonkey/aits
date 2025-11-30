import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    text: string;
    image: string;
    top_p?: number;
    temperature?: number;
    max_new_tokens?: number;
    assistant_prefix?: string;
    decoding_strategy?: Schemas["decoding_strategy"];
    repetition_penalty?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  decoding_strategy: "greedy" | "top-p-sampling";
};

export default {
  "zsxkib/idefics3": (() => {
    const transformer: ReplicateTransformer = {
      chat: {
        convertRequest: async (request, ctx) => {
          const lastMessage = request.messages[request.messages.length - 1];
          let text = "";
          if (typeof lastMessage.content === 'string') {
            text = lastMessage.content;
          } else {
            const textPart = lastMessage.content.find(c => c.type === 'text');
            if (textPart) text = textPart.content as string;
          }

          let imageResource;
          // Find the most recent image in the conversation
          for (let i = request.messages.length - 1; i >= 0; i--) {
            const msg = request.messages[i];
            if (Array.isArray(msg.content)) {
              const imgPart = msg.content.find(c => c.type === 'image');
              if (imgPart) {
                imageResource = imgPart.content;
                break;
              }
            }
          }

          if (!imageResource) {
            throw new Error("Model requires an image input.");
          }

          return {
            text,
            image: await toURL(imageResource),
            max_new_tokens: request.maxTokens,
            temperature: request.temperature,
            top_p: request.topP,
            ...request.extra,
          };
        },
        parseResponse: async (response, ctx) => {
          return {
            content: response as string,
            finishReason: "stop",
          };
        },
        parseChunk: async (chunk, ctx) => {
          return {
            content: chunk.toString(),
          };
        },
      },
      imageAnalyze: {
        convertRequest: async (request, ctx) => {
          return {
            text: request.prompt,
            image: await toURL(request.images[0]),
            max_new_tokens: request.maxTokens,
            temperature: request.temperature,
            ...request.extra,
          };
        },
        parseResponse: async (response, ctx) => {
          return {
            content: response as string,
            finishReason: "stop",
          };
        },
        parseChunk: async (chunk, ctx) => {
          return {
            content: chunk.toString(),
          };
        },
      },
    };
    return transformer;
  })(),
}