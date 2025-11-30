import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    top_p?: number;
    prompt: string;
    num_beams?: number;
    max_length?: number;
    temperature?: number;
    max_new_tokens?: number;
    repetition_penalty?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "daanelson/minigpt-4": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          image: await toURL(request.images[0]),
          temperature: request.temperature,
          max_new_tokens: request.maxTokens,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          content: response,
          finishReason: "stop",
        }),
      },
    };
    return transformer;
  })()
}