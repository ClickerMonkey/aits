import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    width?: number;
    height?: number;
    prompt?: string;
    guidance_scale?: number;
    negative_prompt?: string;
    ip_adapter_scale?: number;
    num_inference_steps?: number;
    controlnet_conditioning_scale?: number;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "grandlineai/instant-id-photorealistic": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          image: await toURL(request.image),
          prompt: request.prompt,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: response }],
        }),
      },
    };
    return transformer;
  })(),
}