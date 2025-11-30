import { toURL, toText } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  lang: "English" | "Spanish" | "Portuguese" | "French" | "German" | "Russian";
  Input: {
    dpi?: number;
    lang?: Schemas["lang"];
    document?: string;
    max_pages?: number;
    enable_editor?: boolean;
    parallel_factor?: number;
  };
  Output: Schemas["ModelOutput"];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  ModelOutput: {
    markdown: string;
    metadata: string;
  };
};

export default {
  "cuuupid/marker": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          document: request.images?.[0] ? await toURL(request.images[0]) : undefined,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          content: await toText(response.markdown),
          finishReason: "stop",
        }),
      },
    };
    return transformer;
  })(),
}