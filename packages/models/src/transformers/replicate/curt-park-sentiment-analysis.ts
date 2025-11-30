import { toText } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    text: string;
  };
  Output: unknown;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "curt-park/sentiment-analysis": (() => {
    const transformer: ReplicateTransformer = {
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const lastMessage = request.messages[request.messages.length - 1];
          let text = "";
          if (typeof lastMessage.content === "string") {
            text = lastMessage.content;
          } else {
            const textContent = lastMessage.content.find((c) => c.type === "text");
            text = textContent ? await toText(textContent.content) : "";
          }
          return {
            text,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            content: JSON.stringify(response),
            finishReason: "stop",
          };
        },
      },
    };
    return transformer;
  })(),
}