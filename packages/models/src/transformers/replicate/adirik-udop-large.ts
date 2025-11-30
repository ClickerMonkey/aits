import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';



export default {
  "adirik/udop-large": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx) => ({
          prompt: request.prompt,
          image: await toURL(request.images[0]),
          ...request.extra,
        }),
        parseResponse: async (response, ctx) => ({
          content: typeof response === 'string' ? response : JSON.stringify(response),
          finishReason: 'stop',
        }),
      },
    };
    return transformer;
  })(),
}