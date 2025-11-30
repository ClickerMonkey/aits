import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    mask?: string;
    seed?: number;
    width?: Schemas["width"];
    height?: Schemas["height"];
    prompt?: string;
    scheduler?: Schemas["scheduler"];
    init_image?: string;
    num_outputs?: number;
    guidance_scale?: number;
    prompt_strength?: number;
    num_inference_steps?: number;
  };
  width: 128 | 256 | 384 | 448 | 512 | 576 | 640 | 704 | 768 | 832 | 896 | 960 | 1024;
  Output: string[];
  Status: "processing" | "succeeded" | "failed";
  height: 128 | 256 | 384 | 448 | 512 | 576 | 640 | 704 | 768 | 832 | 896 | 960 | 1024;
  Request: {
    input?: Schemas["Input"];
    output_file_prefix?: string;
  };
  Response: {
    error?: string;
    output?: Schemas["Output"];
    status: Schemas["Status"];
  };
  scheduler: "DDIM" | "K-LMS" | "PNDM";
};

export default {
  "tstramer/material-diffusion": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: Schemas["Input"] = {
            prompt: request.prompt,
            num_outputs: request.n,
            seed: request.seed,
            ...request.extra,
          };
          if (request.size) {
            const [width, height] = request.size.split('x').map(Number);
            if (!isNaN(width)) input.width = width as Schemas["width"];
            if (!isNaN(height)) input.height = height as Schemas["height"];
          }
          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: response.map(url => ({ url })),
          };
        },
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: Schemas["Input"] = {
            prompt: request.prompt,
            init_image: await toURL(request.image),
            num_outputs: request.n,
            seed: request.seed,
            ...request.extra,
          };
          if (request.mask) {
            input.mask = await toURL(request.mask);
          }
          if (request.size) {
            const [width, height] = request.size.split('x').map(Number);
            if (!isNaN(width)) input.width = width as Schemas["width"];
            if (!isNaN(height)) input.height = height as Schemas["height"];
          }
          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: response.map(url => ({ url })),
          };
        },
      },
    };
    return transformer;
  })(),
}