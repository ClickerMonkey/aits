import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  task: "Face Restoration" | "Face Colorization" | "Face Inpainting";
  Input: {
    task?: Schemas["task"];
    image: string;
    broken_image?: boolean;
    output_individual?: boolean;
  };
  Output: string[];
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
  "yangxy/gpen": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          task: request.extra?.task,
          broken_image: request.extra?.broken_image,
          output_individual: request.extra?.output_individual,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((url) => ({ url })),
        }),
      },
    };
    return transformer;
  })()
}