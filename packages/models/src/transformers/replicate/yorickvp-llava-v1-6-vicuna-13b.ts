import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image?: string;
    top_p?: number;
    prompt: string;
    history?: string[];
    max_tokens?: number;
    temperature?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "yorickvp/llava-v1.6-vicuna-13b": (() => {
    const transformer: ReplicateTransformer = {
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const messages = request.messages;
          const lastMessage = messages[messages.length - 1];
          
          if (lastMessage.role !== 'user') {
            throw new Error('Last message must be from user');
          }

          let prompt = "";
          let image: string | undefined;

          if (typeof lastMessage.content === 'string') {
            prompt = lastMessage.content;
          } else {
            for (const part of lastMessage.content) {
              if (part.type === 'text') {
                prompt += part.content;
              } else if (part.type === 'image') {
                image = await toURL(part.content);
              }
            }
          }

          const history: string[] = [];
          for (let i = 0; i < messages.length - 1; i++) {
            const msg = messages[i];
            if (msg.role === 'system') continue;
            
            let content = "";
            if (typeof msg.content === 'string') {
              content = msg.content;
            } else {
               for (const part of msg.content) {
                  if (part.type === 'text') content += part.content;
               }
            }
            history.push(content);
          }

          return {
            prompt,
            image,
            history,
            max_tokens: request.maxTokens,
            temperature: request.temperature,
            top_p: request.topP,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            content: response.join(''),
            finishReason: 'stop',
            model: 'yorickvp/llava-v1.6-vicuna-13b'
          };
        },
        parseChunk: async (chunk: any, ctx) => {
          return {
            content: chunk.toString(),
          };
        }
      },
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          return {
            prompt: request.prompt,
            image: await toURL(request.images[0]),
            max_tokens: request.maxTokens,
            temperature: request.temperature,
            ...request.extra
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            content: response.join(''),
            finishReason: 'stop',
            model: 'yorickvp/llava-v1.6-vicuna-13b'
          };
        },
        parseChunk: async (chunk: any, ctx) => {
          return {
            content: chunk.toString()
          };
        }
      }
    };
    return transformer;
  })()
}