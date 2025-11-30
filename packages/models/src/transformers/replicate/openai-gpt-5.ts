import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    prompt?: string | null;
    messages?: Record<string, any>[];
    verbosity?: Schemas["verbosity"];
    image_input?: string[];
    system_prompt?: string | null;
    reasoning_effort?: Schemas["reasoning_effort"];
    max_completion_tokens?: number | null;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  verbosity: "low" | "medium" | "high";
  reasoning_effort: "minimal" | "low" | "medium" | "high";
};

export default {
  "openai/gpt-5": (() => {
    const transformer: ReplicateTransformer = {
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const messages = request.messages || [];
          const systemMessage = messages.find((m) => m.role === "system");
          const system_prompt =
            systemMessage && typeof systemMessage.content === "string"
              ? systemMessage.content
              : undefined;

          const apiMessages: Record<string, any>[] = [];
          const image_input: string[] = [];

          for (const m of messages) {
            if (m.role === "system") continue;

            if (typeof m.content === "string") {
              apiMessages.push({ role: m.role, content: m.content });
            } else if (Array.isArray(m.content)) {
              let textContent = "";
              for (const part of m.content) {
                if (part.type === "text") {
                  textContent += part.content;
                } else if (part.type === "image") {
                  image_input.push(await toURL(part.content));
                }
              }
              if (textContent) {
                apiMessages.push({ role: m.role, content: textContent });
              }
            }
          }

          return {
            messages: apiMessages,
            system_prompt,
            image_input: image_input.length > 0 ? image_input : undefined,
            reasoning_effort: request.reason?.effort as Schemas["reasoning_effort"],
            max_completion_tokens: request.maxTokens,
            verbosity: request.extra?.verbosity,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            content: response.join(""),
            finishReason: "stop",
            model: "openai/gpt-5",
          };
        },
        parseChunk: async (chunk: any, ctx) => {
          return {
            content: typeof chunk === "string" ? chunk : "",
          };
        },
      },
    };
    return transformer;
  })(),
}