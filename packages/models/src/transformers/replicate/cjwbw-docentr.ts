import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    model_size?: Schemas["model_size"];
  };
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
  model_size: "base" | "large";
};

export default {
  "cjwbw/docentr": (() => {
    const transformer: ReplicateTransformer = { 
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({ 
          image: await toURL(request.image),
          model_size: request.extra?.model_size,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}