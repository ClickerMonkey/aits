import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    labels?: string;
    text2classify?: string;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "georgedavila/bart-large-mnli-classifier": (() => {
    const transformer: ReplicateTransformer = {
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const lastMessage = request.messages[request.messages.length - 1];
          const content = typeof lastMessage.content === "string"
            ? lastMessage.content
            : lastMessage.content.map(c => c.type === "text" ? c.content : "").join("");

          return {
            text2classify: content,
            labels: request.extra?.labels,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            content: typeof response === "string" ? response : JSON.stringify(response, null, 2),
            finishReason: "stop",
          };
        },
      },
    };
    return transformer;
  })(),
}