import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    debug?: boolean;
    top_k?: number;
    top_p?: number;
    prompt: string;
    temperature?: number;
    max_new_tokens?: number;
    min_new_tokens?: number;
    stop_sequences?: string;
    replicate_weights?: string;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "fofr/prompt-classifier": (() => {
    const transformer: ReplicateTransformer = {
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
              .join("");
          }
          return {
            prompt: `[PROMPT] ${text} [/PROMPT] [SAFETY_RANKING]`,
            max_new_tokens: request.maxTokens,
            temperature: request.temperature,
            top_p: request.topP,
            stop_sequences: Array.isArray(request.stop) ? request.stop.join(",") : request.stop,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            content: response.join("").trim(),
            finishReason: "stop",
          };
        },
      },
    };
    return transformer;
  })(),
}