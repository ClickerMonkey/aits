import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  mode: "fast" | "balanced" | "accurate";
  Input: {
    file: string;
    mode?: Schemas["mode"];
    use_llm?: boolean;
    paginate?: boolean;
    force_ocr?: boolean;
    max_pages?: number | null;
    page_range?: string | null;
    skip_cache?: boolean;
    page_schema?: string | null;
    format_lines?: boolean;
    save_checkpoint?: boolean;
    disable_ocr_math?: boolean;
    include_metadata?: boolean;
    additional_config?: string | null;
    strip_existing_ocr?: boolean;
    segmentation_schema?: string | null;
    block_correction_prompt?: string | null;
    disable_image_extraction?: boolean;
  };
  Output: Schemas["MarkerOutput"];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  MarkerOutput: {
    images?: string[] | null;
    markdown?: string | null;
    metadata?: {
      [key: string]: unknown;
    } | null;
    json_data?: {
      [key: string]: unknown;
    } | null;
    page_count: number;
    extraction_schema_json?: string | null;
  };
};

export default {
  "datalab-to/marker": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const image = request.images && request.images[0];
          return {
            file: image ? await toURL(image) : "",
            block_correction_prompt: request.prompt,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            content: response.markdown ?? (response.json_data ? JSON.stringify(response.json_data) : ""),
            finishReason: "stop",
          };
        },
      },
    };
    return transformer;
  })(),
}