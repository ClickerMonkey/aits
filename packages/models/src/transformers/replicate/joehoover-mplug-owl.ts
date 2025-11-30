import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';



export default {
  "joehoover/mplug-owl": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx) => ({
          prompt: request.prompt,
          img: request.images && request.images.length > 0 ? await toURL(request.images[0]) : undefined,
          max_length: request.maxTokens,
          temperature: request.temperature,
          ...request.extra,
        }),
        parseResponse: async (response, ctx) => ({
          content: Array.isArray(response) ? response.join('') : String(response),
          finishReason: 'stop',
        }),
      },
    };
    return transformer;
  })(),
}