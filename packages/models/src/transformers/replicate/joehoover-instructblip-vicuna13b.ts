import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';



export default {
  "joehoover/instructblip-vicuna13b": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx) => ({
          img: await toURL(request.images[0]),
          prompt: request.prompt,
          max_length: request.maxTokens,
          temperature: request.temperature,
          ...request.extra,
        }),
        parseResponse: async (response, ctx) => ({
          content: Array.isArray(response) ? response.join('') : String(response),
          finishReason: 'stop',
        }),
        parseChunk: async (chunk, ctx) => ({
          content: String(chunk),
        }),
      },
    };
    return transformer;
  })(),
}