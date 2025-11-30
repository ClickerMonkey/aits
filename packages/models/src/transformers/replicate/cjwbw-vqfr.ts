import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    aligned?: boolean;
  };
  Output: Schemas["ModelOutput"][];
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
  ModelOutput: {
    image: string;
  };
};

export default {
  "cjwbw/vqfr": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          aligned: request.extra?.aligned,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((item) => ({ url: item.image })),
        }),
      },
    };
    return transformer;
  })(),
}