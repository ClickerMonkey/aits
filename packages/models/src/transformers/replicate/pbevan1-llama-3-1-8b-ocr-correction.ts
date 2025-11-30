import { toText } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    inp: string;
    instruction: string;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default { 
  "pbevan1/llama-3.1-8b-ocr-correction": (() => {
    const transformer: ReplicateTransformer = { 
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const getText = async (content: any): Promise<string> => {
            if (typeof content === "string") return content;
            if (Array.isArray(content)) {
               const parts = [];
               for (const c of content) {
                 if (c.type === 'text') {
                   parts.push(typeof c.content === 'string' ? c.content : await toText(c.content));
                 }
               }
               return parts.join('');
            }
            return "";
          };

          const systemMessage = request.messages.find((m) => m.role === "system");
          const userMessage = request.messages.filter((m) => m.role === "user").pop();

          const instruction = systemMessage
            ? await getText(systemMessage.content)
            : "You are an assistant that takes a piece of text that has been corrupted during OCR digitisation, and produce a corrected version of the same text.";

          const inp = userMessage ? await getText(userMessage.content) : "";

          return {
            inp,
            instruction,
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
  })(),
}