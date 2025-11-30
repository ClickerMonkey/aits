import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    media: string;
    prompt?: string;
    max_new_tokens?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "lucataco/qwen2-vl-7b-instruct": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const mediaUrl = request.images && request.images.length > 0 
            ? await toURL(request.images[0]) 
            : undefined;
            
          if (!mediaUrl) {
            throw new Error("No image or video provided in request.images");
          }

          return {
            media: mediaUrl,
            prompt: request.prompt,
            max_new_tokens: request.maxTokens,
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