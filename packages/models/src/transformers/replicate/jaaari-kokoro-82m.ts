import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    text: string;
    speed?: number;
    voice?: Schemas["voice"];
  };
  voice: "af_alloy" | "af_aoede" | "af_bella" | "af_jessica" | "af_kore" | "af_nicole" | "af_nova" | "af_river" | "af_sarah" | "af_sky" | "am_adam" | "am_echo" | "am_eric" | "am_fenrir" | "am_liam" | "am_michael" | "am_onyx" | "am_puck" | "bf_alice" | "bf_emma" | "bf_isabella" | "bf_lily" | "bm_daniel" | "bm_fable" | "bm_george" | "bm_lewis" | "ff_siwis" | "hf_alpha" | "hf_beta" | "hm_omega" | "hm_psi" | "if_sara" | "im_nicola" | "jf_alpha" | "jf_gongitsune" | "jf_nezumi" | "jf_tebukuro" | "jm_kumo" | "zf_xiaobei" | "zf_xiaoni" | "zf_xiaoxiao" | "zf_xiaoyi" | "zm_yunjian" | "zm_yunxi" | "zm_yunxia" | "zm_yunyang";
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "jaaari/kokoro-82m": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          text: request.text,
          speed: request.speed,
          voice: request.voice as Schemas["voice"],
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          audio: await toReadableStream(response),
        }),
      },
    };
    return transformer;
  })()
}