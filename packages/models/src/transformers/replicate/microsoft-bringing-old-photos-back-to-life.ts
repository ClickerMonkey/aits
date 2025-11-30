import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    HR?: boolean;
    image: string;
    with_scratch?: boolean;
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
  "microsoft/bringing-old-photos-back-to-life": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          HR: request.extra?.HR,
          with_scratch: request.extra?.with_scratch,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: response }],
        }),
      },
    };
    return transformer;
  })(),
}