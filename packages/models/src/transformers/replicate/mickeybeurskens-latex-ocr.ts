import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image_path: string;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "mickeybeurskens/latex-ocr": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image_path: await toURL(request.images[0]),
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          content: response,
          finishReason: "stop",
        }),
      },
    };
    return transformer;
  })(),
}