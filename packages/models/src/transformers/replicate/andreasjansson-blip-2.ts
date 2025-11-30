import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    caption?: boolean;
    context?: string;
    question?: string;
    temperature?: number;
    use_nucleus_sampling?: boolean;
  };
  Output: string;
};

export default {
  "andreasjansson/blip-2": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          return {
            image: await toURL(request.images[0]),
            question: request.prompt,
            temperature: request.temperature,
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