import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    input: string;
    target?: string;
    neutral?: string;
    manipulation_strength?: number;
    disentanglement_threshold?: number;
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
};

export default {
  "orpatashnik/styleclip": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          input: await toURL(request.image),
          target: request.prompt,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}