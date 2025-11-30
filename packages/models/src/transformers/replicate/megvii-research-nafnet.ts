import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    image_r?: string;
    task_type?: Schemas["task_type"];
  };
  Output: string;
  Status: "processing" | "success" | "failed";
  Request: {
    input?: Schemas["Input"];
    output_file_prefix?: string;
  };
  Response: {
    error?: string;
    output?: Schemas["Output"];
    status: Schemas["Status"];
  };
  task_type: "Image Denoising" | "Image Debluring (GoPro)" | "Image Debluring (REDS)" | "Stereo Image Super-Resolution";
};

export default {
  "megvii-research/nafnet": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          task_type: request.extra?.task_type,
          image_r: request.extra?.image_r ? await toURL(request.extra.image_r) : undefined,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}