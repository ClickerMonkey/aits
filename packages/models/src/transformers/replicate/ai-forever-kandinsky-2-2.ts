import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    width?: Schemas["width"];
    height?: Schemas["height"];
    prompt?: string;
    num_outputs?: number;
    output_format?: Schemas["output_format"];
    negative_prompt?: string;
    num_inference_steps?: number;
    num_inference_steps_prior?: number;
  };
  width: 384 | 512 | 576 | 640 | 704 | 768 | 960 | 1024 | 1152 | 1280 | 1536 | 1792 | 2048;
  Output: string[];
  height: 384 | 512 | 576 | 640 | 704 | 768 | 960 | 1024 | 1152 | 1280 | 1536 | 1792 | 2048;
  output_format: "webp" | "jpeg" | "png";
};

export default {
  "ai-forever/kandinsky-2.2": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let width: Schemas["width"] | undefined;
          let height: Schemas["height"] | undefined;
          if (request.size) {
            const parts = request.size.split('x');
            width = Number(parts[0]) as Schemas["width"];
            height = Number(parts[1]) as Schemas["height"];
          }
          return {
            prompt: request.prompt,
            num_outputs: request.n,
            seed: request.seed,
            width,
            height,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: await Promise.all(response.map(async (url) => ({
              url: await toURL(url),
            }))),
          };
        },
      },
    };
    return transformer;
  })(),
}