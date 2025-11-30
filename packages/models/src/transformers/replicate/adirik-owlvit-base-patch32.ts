import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image?: string;
    query?: string;
    threshold?: number;
    show_visualisation?: boolean;
  };
  Output: Schemas["ModelOutput"];
  ModelOutput: {
    json_data: Record<string, never>;
    result_image?: string;
  };
};

export default {
  "adirik/owlvit-base-patch32": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.images[0]),
          query: request.prompt,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          content: JSON.stringify(response.json_data),
          finishReason: 'stop',
        }),
      },
    };
    return transformer;
  })(),
}