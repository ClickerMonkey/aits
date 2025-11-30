import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  mode: "Real Gray Colorization" | "Multi-modal class vector c";
  Input: {
    mode?: Schemas["mode"];
    image: string;
    classes?: string;
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
  "cjwbw/bigcolor": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          mode: request.extra?.mode,
          classes: request.extra?.classes,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((item) => ({ url: item.image })),
        }),
      },
    };
    return transformer;
  })(),
}