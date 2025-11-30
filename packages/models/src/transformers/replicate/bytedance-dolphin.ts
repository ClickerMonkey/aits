import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    file: string;
    output_format?: Schemas["output_format"];
  };
  Output: unknown;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  output_format: "markdown_content" | "json_content";
};

export default {
  "bytedance/dolphin": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const file = await toURL(request.images[0]);
          return {
            file,
            output_format: request.extra?.output_format ?? "markdown_content",
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          const content = typeof response === 'string' ? response : JSON.stringify(response);
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