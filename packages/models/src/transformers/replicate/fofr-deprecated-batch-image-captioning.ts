import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    model?: Schemas["model"];
    max_dimension?: number;
    system_prompt?: string;
    caption_prefix?: string;
    caption_suffix?: string;
    message_prompt?: string;
    openai_api_key?: string;
    anthropic_api_key?: string;
    image_zip_archive: string;
    google_generativeai_api_key?: string;
    resize_images_for_captioning?: boolean;
  };
  model: "gpt-4o-2024-08-06" | "gpt-4o-mini" | "gpt-4o" | "gpt-4-turbo" | "claude-3-5-sonnet-20240620" | "claude-3-opus-20240229" | "claude-3-sonnet-20240229" | "claude-3-haiku-20240307" | "gemini-1.5-pro" | "gemini-1.5-flash";
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "fofr/deprecated-batch-image-captioning": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let image_zip_archive = request.extra?.image_zip_archive;
          
          // If not explicitly provided in extra, try to use the first image from the standard request
          if (!image_zip_archive && request.images && request.images.length > 0) {
            image_zip_archive = await toURL(request.images[0]);
          }

          if (!image_zip_archive) {
            throw new Error("image_zip_archive is required. Please provide it in 'extra' or as the first item in 'images'.");
          }

          return {
            image_zip_archive,
            message_prompt: request.prompt,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
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