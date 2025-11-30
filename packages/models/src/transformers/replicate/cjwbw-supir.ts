import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    image: string;
    s_cfg?: number;
    s_churn?: number;
    s_noise?: number;
    upscale?: number;
    a_prompt?: string;
    min_size?: number;
    n_prompt?: string;
    s_stage1?: number;
    s_stage2?: number;
    edm_steps?: number;
    use_llava?: boolean;
    linear_CFG?: boolean;
    model_name?: Schemas["model_name"];
    color_fix_type?: Schemas["color_fix_type"];
    spt_linear_CFG?: number;
    linear_s_stage2?: boolean;
    spt_linear_s_stage2?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  model_name: "SUPIR-v0Q" | "SUPIR-v0F";
  color_fix_type: "None" | "AdaIn" | "Wavelet";
};

export default {
  "cjwbw/supir": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          a_prompt: request.prompt,
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