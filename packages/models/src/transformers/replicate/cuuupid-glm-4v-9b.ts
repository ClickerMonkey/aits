import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    top_k?: number;
    prompt: string;
    max_length?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default { 
  "cuuupid/glm-4v-9b": (() => {
    const transformer: ReplicateTransformer = { 
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const lastMessage = request.messages[request.messages.length - 1];
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

          if (!image && request.extra?.image) {
            image = await toURL(request.extra.image);
          }

          if (!image) {
            throw new Error("Model cuuupid/glm-4v-9b requires an image input.");
          }

          return { 
            prompt,
            image,
            max_length: request.maxTokens,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          content: response.join(""),
          finishReason: "stop",
        }),
        parseChunk: async (chunk: string, ctx) => ({
          content: chunk,
        }),
      },
    };
    return transformer;
  })(), 
}