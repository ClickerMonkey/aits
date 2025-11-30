import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    jpeg?: number;
    image: string;
    noise?: Schemas["noise"];
    task_type?: Schemas["task_type"];
  };
  noise: 15 | 25 | 50;
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
  task_type: "Real-World Image Super-Resolution-Large" | "Real-World Image Super-Resolution-Medium" | "Grayscale Image Denoising" | "Color Image Denoising" | "JPEG Compression Artifact Reduction";
};

export default {
  "jingyunliang/swinir": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          jpeg: request.extra?.jpeg,
          noise: request.extra?.noise,
          task_type: request.extra?.task_type,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}