import { toURL, toText } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    top_p?: number;
    images?: string[];
    prompt: string;
    videos?: string[];
    temperature?: number;
    thinking_budget?: number | null;
    dynamic_thinking?: boolean;
    max_output_tokens?: number;
    system_instruction?: string | null;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default { 
  "google/gemini-2.5-flash": (() => {
    const transformer: ReplicateTransformer = { 
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let prompt = "";
          let system_instruction: string | undefined;
          const images: string[] = [];
          const videos: string[] = [];

          const systemMsg = request.messages.find(m => m.role === 'system');
          if (systemMsg) {
            system_instruction = typeof systemMsg.content === 'string' 
              ? systemMsg.content 
              : (await Promise.all(systemMsg.content.filter(part => part.type === 'text').map(part => toText(part.content)))).join("\n");
          }

          const conversationMessages = request.messages.filter(m => m.role !== 'system');

          const processContent = async (content: string | any[]) => {
            let text = "";
            if (typeof content === 'string') {
              text = content;
            } else {
              for (const part of content) {
                if (part.type === 'text') {
                  text += await toText(part.content);
                } else if (part.type === 'image') {
                  images.push(await toURL(part.content));
                } else if (part.type === 'file') {
                  videos.push(await toURL(part.content));
                }
              }
            }
            return text;
          };

          if (conversationMessages.length === 1) {
            prompt = await processContent(conversationMessages[0].content);
          } else {
            for (const msg of conversationMessages) {
              const text = await processContent(msg.content);
              prompt += `${msg.role === 'user' ? 'User' : 'Model'}: ${text}\n`;
            }
          }

          return { 
            prompt: prompt.trim(),
            system_instruction,
            images: images.length > 0 ? images : undefined,
            videos: videos.length > 0 ? videos : undefined,
            top_p: request.topP,
            temperature: request.temperature,
            max_output_tokens: request.maxTokens,
            thinking_budget: request.reason?.maxTokens,
            dynamic_thinking: request.extra?.dynamic_thinking,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          content: response.join(""),
          finishReason: "stop",
          model: "google/gemini-2.5-flash"
        }),
        parseChunk: async (chunk: string, ctx) => ({
          content: chunk,
        }),
      },
    };
    return transformer;
  })(),
}