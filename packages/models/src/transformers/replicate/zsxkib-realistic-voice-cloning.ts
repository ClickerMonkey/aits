import { toURL, toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    protect?: number;
    rvc_model?: Schemas["rvc_model"];
    index_rate?: number;
    song_input?: string;
    reverb_size?: number;
    pitch_change?: Schemas["pitch_change"];
    rms_mix_rate?: number;
    filter_radius?: number;
    output_format?: Schemas["output_format"];
    reverb_damping?: number;
    reverb_dryness?: number;
    reverb_wetness?: number;
    crepe_hop_length?: number;
    pitch_change_all?: number;
    main_vocals_volume_change?: number;
    pitch_detection_algorithm?: Schemas["pitch_detection_algorithm"];
    instrumental_volume_change?: number;
    backup_vocals_volume_change?: number;
    custom_rvc_model_download_url?: string;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  rvc_model: "Squidward" | "MrKrabs" | "Plankton" | "Drake" | "Vader" | "Trump" | "Biden" | "Obama" | "Guitar" | "Voilin" | "CUSTOM";
  pitch_change: "no-change" | "male-to-female" | "female-to-male";
  output_format: "mp3" | "wav";
  pitch_detection_algorithm: "rmvpe" | "mangio-crepe";
};

export default {
  "zsxkib/realistic-voice-cloning": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          return {
            song_input: request.extra?.song_input ? await toURL(request.extra.song_input) : undefined,
            rvc_model: request.voice as Schemas["rvc_model"],
            output_format: request.responseFormat as Schemas["output_format"],
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            audio: await toReadableStream(response),
          };
        },
      },
    };
    return transformer;
  })()
}