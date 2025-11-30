import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';



export default {
  "yorickvp/llava-13b": (() => {
    const transformer: ReplicateTransformer = {
      chat: {
        convertRequest: async (request, ctx) => {
          let prompt = "";
          let image: string | undefined;

          // Extract the last user message for the prompt and the last image found
          for (const message of request.messages) {
            if (message.role === 'user') {
              if (typeof message.content === 'string') {
                prompt = message.content;
              } else if (Array.isArray(message.content)) {
                for (const part of message.content) {
                  if (part.type === 'text') {
                    prompt = part.content as string;
                  } else if (part.type === 'image') {
                    image = await toURL(part.content);
                  }
                }
              }
            }
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
          return {
            content: Array.isArray(response) ? response.join('') : '',
            finishReason: 'stop',
            model: 'yorickvp/llava-13b',
          };
        },
        parseChunk: async (chunk, ctx) => {
          return {
            content: typeof chunk === 'string' ? chunk : '',
          };
        },
      },
    };
    return transformer;
  })()
}