import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    width?: number;
    height?: number;
    prompt?: string;
    face_image: string;
    num_outputs?: number;
    negative_prompt?: string;
    num_inference_steps?: number;
    agree_to_research_only?: boolean;
  };
  Output: string[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "lucataco/ip-adapter-faceid": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let width: number | undefined;
          let height: number | undefined;
          if (request.size) {
            const parts = request.size.split('x');
            if (parts.length === 2) {
              width = Number(parts[0]);
              height = Number(parts[1]);
            }
          }
          return {
            prompt: request.prompt,
            width,
            height,
            num_outputs: request.n,
            seed: request.seed,
            face_image: request.extra?.face_image,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let width: number | undefined;
          let height: number | undefined;
          if (request.size) {
            const parts = request.size.split('x');
            if (parts.length === 2) {
              width = Number(parts[0]);
              height = Number(parts[1]);
            }
          }
          return {
            prompt: request.prompt,
            face_image: await toURL(request.image),
            width,
            height,
            num_outputs: request.n,
            seed: request.seed,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: await Promise.all(response.map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
    };
    return transformer;
  })()
}