import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    enhance_model?: Schemas["enhance_model"];
    output_format?: Schemas["output_format"];
    upscale_factor?: Schemas["upscale_factor"];
    face_enhancement?: boolean;
    subject_detection?: Schemas["subject_detection"];
    face_enhancement_strength?: number;
    face_enhancement_creativity?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  enhance_model: "Standard V2" | "Low Resolution V2" | "CGI" | "High Fidelity V2" | "Text Refine";
  output_format: "jpg" | "png";
  upscale_factor: "None" | "2x" | "4x" | "6x";
  subject_detection: "None" | "All" | "Foreground" | "Background";
};

export default {
  "topazlabs/image-upscale": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })()
}