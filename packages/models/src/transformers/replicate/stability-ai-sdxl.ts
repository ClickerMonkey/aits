import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';



export default {
  "stability-ai/sdxl": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx) => {
          let width = 1024;
          let height = 1024;
          if (request.size) {
            const parts = request.size.split('x');
            if (parts.length === 2) {
              width = parseInt(parts[0]);
              height = parseInt(parts[1]);
            }
          }
          return {
            prompt: request.prompt,
            width,
            height,
            num_outputs: request.n,
            seed: request.seed,
            ...request.extra,
          };
        },
        parseResponse: async (response, ctx) => {
          return {
            images: await Promise.all((response as string[]).map(async (url) => ({
              url: await toURL(url),
            }))),
          };
        },
      },
      imageEdit: {
        convertRequest: async (request, ctx) => {
          let width = 1024;
          let height = 1024;
          if (request.size) {
            const parts = request.size.split('x');
            if (parts.length === 2) {
              width = parseInt(parts[0]);
              height = parseInt(parts[1]);
            }
          }
          return {
            prompt: request.prompt,
            image: await toURL(request.image),
            mask: request.mask ? await toURL(request.mask) : undefined,
            width,
            height,
            num_outputs: request.n,
            seed: request.seed,
            ...request.extra,
          };
        },
        parseResponse: async (response, ctx) => {
          return {
            images: await Promise.all((response as string[]).map(async (url) => ({
              url: await toURL(url),
            }))),
          };
        },
      },
    };
    return transformer;
  })(),
}