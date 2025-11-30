import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    steps?: number;
    num_sample?: number;
    face_guidance?: number;
    lamda_feature?: number;
    output_format?: Schemas["output_format"];
    output_quality?: number;
    negative_prompt?: string;
    positive_prompt: string;
    reference_face_1: string;
    reference_face_2?: string;
    reference_face_3?: string;
    reference_face_4?: string;
    face_bounding_box?: string;
    text_control_scale?: number;
    default_negative_prompt?: string;
    default_position_prompt?: string;
    step_to_launch_face_guidance?: number;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  output_format: "webp" | "jpg" | "png";
};

export default {
  "zsxkib/flash-face": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          positive_prompt: request.prompt,
          reference_face_1: await toURL(request.image),
          num_sample: request.n,
          seed: request.seed,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: response.map((url) => ({ url })),
        }),
      },
    };
    return transformer;
  })(),
}