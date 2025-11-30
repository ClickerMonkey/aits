import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    seed?: number;
    width?: Schemas["width"];
    height?: Schemas["height"];
    prompt?: string;
    scheduler?: Schemas["scheduler"];
    batch_size?: Schemas["batch_size"];
    prior_steps?: string;
    output_format?: Schemas["output_format"];
    guidance_scale?: number;
    output_quality?: number;
    prior_cf_scale?: number;
    num_inference_steps?: number;
  };
  width: 256 | 288 | 432 | 512 | 576 | 768 | 1024;
  Output: string[];
  height: 256 | 288 | 432 | 512 | 576 | 768 | 1024;
  scheduler: "ddim_sampler" | "p_sampler" | "plms_sampler";
  batch_size: 1 | 2 | 3 | 4;
  output_format: "webp" | "jpg" | "png";
};

export default {
  "ai-forever/kandinsky-2": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let width: Schemas["width"] | undefined;
          let height: Schemas["height"] | undefined;
          
          if (request.size) {
            const parts = request.size.split('x').map(Number);
            if (parts.length === 2) {
              // Cast to specific types if they match known values, otherwise let the model validation handle it or fallback
              const [w, h] = parts;
              width = w as Schemas["width"];
              height = h as Schemas["height"];
            }
          }

          return {
            prompt: request.prompt,
            width,
            height,
            batch_size: request.n as Schemas["batch_size"],
            seed: request.seed,
            ...request.extra,
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