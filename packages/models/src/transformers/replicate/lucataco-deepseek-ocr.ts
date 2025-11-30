import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    task_type?: Schemas["task_type"];
    reference_text?: string;
    resolution_size?: Schemas["resolution_size"];
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  task_type: "Convert to Markdown" | "Free OCR" | "Parse Figure" | "Locate Object by Reference";
  resolution_size: "Gundam (Recommended)" | "Tiny" | "Small" | "Base" | "Large";
};

export default {
  "lucataco/deepseek-ocr": (() => {
    const transformer: ReplicateTransformer = { 
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({ 
          image: await toURL(request.images[0]),
          reference_text: request.prompt,
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