import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
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
  "methexis-inc/img2prompt": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx) => {
          if (!request.images || request.images.length === 0) {
            throw new Error("Image is required for img2prompt");
          }
          return {
            image: await toURL(request.images[0]),
            ...request.extra,
          };
        },
        parseResponse: async (response: string, ctx) => {
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