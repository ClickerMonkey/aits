import { Resource, toText } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    input_str: string;
    model_type?: Schemas["model_type"];
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  model_type: "m1_base" | "m1_large";
};

export default {
  "kshitijagrwl/pii-extractor-llm": (() => {
    const transformer: ReplicateTransformer = {
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const userMsg = request.messages.slice().reverse().find((m) => m.role === "user");
          const content = userMsg 
            ? typeof userMsg.content === 'string'
              ? [{ type: 'text', content: userMsg.content as Resource }]
              : userMsg.content
            : [];
          const resolved = await Promise.all(content.map(c => toText(c.content)));
          return {
            input_str: resolved.join("\n"),
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            content: response,
            finishReason: "stop",
          };
        },
      },
    };
    return transformer;
  })()
}