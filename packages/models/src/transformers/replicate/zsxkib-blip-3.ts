import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    top_k?: number;
    top_p?: number;
    caption?: boolean;
    context?: string;
    question?: string;
    do_sample?: boolean;
    num_beams?: number;
    temperature?: number;
    system_prompt?: string;
    length_penalty?: number;
    max_new_tokens?: number;
    repetition_penalty?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "zsxkib/blip-3": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: Schemas["Input"] = {
            image: await toURL(request.images[0]),
            question: request.prompt,
            ...request.extra,
          };
          if (request.maxTokens) input.max_new_tokens = request.maxTokens;
          if (request.temperature) input.temperature = request.temperature;
          return input;
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