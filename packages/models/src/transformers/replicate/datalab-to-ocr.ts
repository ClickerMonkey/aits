import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    file: string;
    max_pages?: number | null;
    visualize?: boolean;
    page_range?: string | null;
    skip_cache?: boolean;
    return_pages?: boolean;
  };
  Output: Schemas["OCROutput"];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  OCROutput: {
    text: string;
    pages?: {
      [key: string]: unknown;
    }[] | null;
    page_count?: number | null;
    visualizations?: string[] | null;
  };
};

export default {
  "datalab-to/ocr": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const file = request.images && request.images.length > 0 ? await toURL(request.images[0]) : undefined;
          if (!file) throw new Error("No image provided for OCR");
          
          return {
            file,
            visualize: request.extra?.visualize,
            page_range: request.extra?.page_range,
            return_pages: request.extra?.return_pages,
            max_pages: request.extra?.max_pages,
            skip_cache: request.extra?.skip_cache,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            content: response.text,
            finishReason: "stop",
          };
        },
      },
    };
    return transformer;
  })(),
}