import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    prompt: string;
    aspect_ratio?: Schemas["aspect_ratio"];
    number_of_images?: number;
    prompt_optimizer?: boolean;
    subject_reference?: string;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  aspect_ratio: "1:1" | "16:9" | "4:3" | "3:2" | "2:3" | "3:4" | "9:16" | "21:9";
};

export default {
  "minimax/image-01": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const { subject_reference, ...extra } = request.extra || {};
          return {
            prompt: request.prompt,
            number_of_images: request.n,
            aspect_ratio: request.size as any,
            ...extra,
            subject_reference: subject_reference ? await toURL(subject_reference) : undefined,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: response.map((url) => ({ url })),
          };
        },
      },
    };
    return transformer;
  })(),
}