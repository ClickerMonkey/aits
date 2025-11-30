import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';



export default {
  "yorickvp/llava-v1.6-34b": (() => {
    const transformer: ReplicateTransformer = {
      chat: {
        convertRequest: async (request, ctx) => {
          const messages = request.messages;
          const lastMessage = messages[messages.length - 1];
          
          let prompt = "";
          let image: string | undefined;

          // Construct prompt from messages or just use last message content
          // For this model, we'll focus on the last message for the prompt text
          // and look for an image in the content.
          if (Array.isArray(lastMessage.content)) {
            for (const part of lastMessage.content) {
              if (part.type === 'text') {
                prompt += part.content;
              } else if (part.type === 'image') {
                image = await toURL(part.content);
              }
            }
          } else {
            prompt = lastMessage.content;
          }

          return {
            prompt,
            image,
            max_tokens: request.maxTokens,
            temperature: request.temperature,
            top_p: request.topP,
            ...request.extra,
          };
        },
        parseResponse: async (response, ctx) => {
          // The model returns an array of strings
          const text = Array.isArray(response) ? response.join('') : (typeof response === 'string' ? response : '');
          return {
            content: text,
            finishReason: 'stop',
          };
        },
        parseChunk: async (chunk, ctx) => {
          // Replicate streams text chunks as strings for this model
          return {
            content: typeof chunk === 'string' ? chunk : '',
          };
        },
      },
    };
    return transformer;
  })(),
}