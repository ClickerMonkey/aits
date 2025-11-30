import { toURL, toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    beta?: number;
    seed?: number;
    text: string;
    alpha?: number;
    weights?: string;
    reference?: string;
    diffusion_steps?: number;
    embedding_scale?: number;
  };
  Output: string;
};

export default {
  "adirik/styletts2": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const extra = request.extra || {};
          return {
            text: request.text,
            beta: extra.beta,
            seed: extra.seed,
            alpha: extra.alpha,
            weights: extra.weights,
            reference: extra.reference ? await toURL(extra.reference) : undefined,
            diffusion_steps: extra.diffusion_steps,
            embedding_scale: extra.embedding_scale,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          audio: await toReadableStream(response),
        }),
      },
    };
    return transformer;
  })(),
}