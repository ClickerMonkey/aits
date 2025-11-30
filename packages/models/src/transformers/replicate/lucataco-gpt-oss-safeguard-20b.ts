import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    top_p?: number;
    policy?: string;
    prompt?: string;
    temperature?: number;
    max_new_tokens?: number;
    reasoning_effort?: Schemas["reasoning_effort"];
    repetition_penalty?: number;
  };
  Output: {
    [key: string]: unknown;
  };
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  reasoning_effort: "low" | "medium" | "high";
};

export default {
  "lucataco/gpt-oss-safeguard-20b": (() => {
    const transformer: ReplicateTransformer = {
      chat: {
        convertRequest: async (request, ctx) => {
          const systemMsg = request.messages.find((m) => m.role === "system");
          const userMsg = request.messages.findLast((m) => m.role === "user");
          const prompt = userMsg && typeof userMsg.content === "string" ? userMsg.content : "";
          const policy = systemMsg && typeof systemMsg.content === "string" ? systemMsg.content : request.extra?.policy;

          return {
            prompt,
            policy,
            top_p: request.topP,
            temperature: request.temperature,
            max_new_tokens: request.maxTokens,
            reasoning_effort: request.reason?.effort,
            repetition_penalty: request.extra?.repetition_penalty,
          };
        },
        parseResponse: async (response: any, ctx) => {
          return {
            content: `Analysis: ${response.analysis}\n\nAnswer: ${response.answer}`,
            finishReason: "stop",
            model: "lucataco/gpt-oss-safeguard-20b",
          };
        },
      },
    };
    return transformer;
  })()
}