import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    model?: Schemas["model"];
    use_beam_search?: boolean;
  };
  model: "coco" | "conceptual-captions";
  Output: string;
  Status: "processing" | "succeeded" | "failed";
  Request: {
    input?: Schemas["Input"];
    output_file_prefix?: string;
  };
  Response: {
    error?: string;
    output?: Schemas["Output"];
    status: Schemas["Status"];
  };
};

export default {
  "rmokady/clip_prefix_caption": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.images[0]),
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => {
          // Handle potential runtime discrepancy where output is an array of objects despite schema saying string
          const data = response as any;
          const content = Array.isArray(data) && data[0]?.text 
            ? data[0].text 
            : String(data);
            
          return {
            content,
            finishReason: 'stop',
          };
        },
      },
    };
    return transformer;
  })(),
}