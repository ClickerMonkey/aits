import { toURL, toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';



export default {
  "afiaka87/tortoise-tts": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx) => {
          return {
            text: request.text,
            voice_a: request.voice,
            custom_voice: request.extra?.custom_voice ? await toURL(request.extra.custom_voice) : undefined,
            preset: request.extra?.preset,
            seed: request.extra?.seed,
            cvvp_amount: request.extra?.cvvp_amount,
            voice_b: request.extra?.voice_b,
            voice_c: request.extra?.voice_c,
          };
        },
        parseResponse: async (response, ctx) => {
          return {
            audio: await toReadableStream(response),
          };
        },
      },
    };
    return transformer;
  })(),
}