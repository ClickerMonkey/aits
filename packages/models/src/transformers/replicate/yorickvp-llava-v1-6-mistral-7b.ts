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
  "yorickvp/llava-v1.6-mistral-7b": (() => {
    const transformer: ReplicateTransformer = {
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const messages = request.messages || [];
          const lastMessage = messages[messages.length - 1];

          if (!lastMessage) {
            throw new Error("No messages provided");
          }

          let prompt = "";
          let image: string | undefined;

          if (typeof lastMessage.content === "string") {
            prompt = lastMessage.content;
          } else {
            for (const part of lastMessage.content) {
              if (part.type === "text") {
                prompt += part.content;
              } else if (part.type === "image") {
                image = await toURL(part.content);
              }
            }
          }

          const history: string[] = [];
          for (let i = 0; i < messages.length - 1; i++) {
            const msg = messages[i];
            let content = "";
            if (typeof msg.content === "string") {
              content = msg.content;
            } else if (Array.isArray(msg.content)) {
              content = msg.content
                .filter((c) => c.type === "text")
                .map((c) => c.content)
                .join("");
            }
            if (content) history.push(content);
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
            content: response.join(""),
            finishReason: "stop",
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