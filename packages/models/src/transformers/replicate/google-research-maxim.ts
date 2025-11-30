import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    model: Schemas["model"];
  };
  model: "Image Denoising" | "Image Deblurring (GoPro)" | "Image Deblurring (REDS)" | "Image Deblurring (RealBlur_R)" | "Image Deblurring (RealBlur_J)" | "Image Deraining (Rain streak)" | "Image Deraining (Rain drop)" | "Image Dehazing (Indoor)" | "Image Dehazing (Outdoor)" | "Image Enhancement (Low-light)" | "Image Enhancement (Retouching)";
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
};

export default {
  "google-research/maxim": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          model: (request.extra?.model as Schemas["model"]) || "Image Deblurring (GoPro)",
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}