import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    audio?: string;
    image?: string;
    video?: string;
    prompt?: string;
    voice_type?: Schemas["voice_type"];
    system_prompt?: string;
    generate_audio?: boolean;
    use_audio_in_video?: boolean;
  };
  Output: {
    text: string;
    voice?: string;
  };
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  voice_type: "Chelsie" | "Ethan";
};

export default {
  "lucataco/qwen2.5-omni-7b": (() => {
    const transformer: ReplicateTransformer = { 
      chat: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          let prompt = "";
          let system_prompt = "You are Qwen, a virtual human developed by the Qwen Team, Alibaba Group, capable of perceiving auditory and visual inputs, as well as generating text and speech.";
          let image: string | undefined;
          let video: string | undefined;
          let audio: string | undefined;

          for (const msg of request.messages) {
            if (msg.role === 'system') {
              system_prompt = typeof msg.content === 'string' ? msg.content : msg.content.map(c => c.type === 'text' ? c.content : '').join('');
            } else if (msg.role === 'user') {
              if (typeof msg.content === 'string') {
                prompt += msg.content + "\n";
              } else {
                for (const c of msg.content) {
                  if (c.type === 'text') {
                    prompt += c.content + "\n";
                  } else if (c.type === 'image') {
                    image = await toURL(c.content);
                  } else if (c.type === 'audio') {
                    audio = await toURL(c.content);
                  } else if (c.type === 'file') {
                    const url = await toURL(c.content);
                    if (url.match(/\.(mp4|mov|avi|webm|mkv)$/i)) {
                      video = url;
                    }
                  }
                }
              }
            }
          }

          return { 
            prompt: prompt.trim(),
            system_prompt,
            image: request.extra?.image ? await toURL(request.extra.image) : image,
            video: request.extra?.video ? await toURL(request.extra.video) : video,
            audio: request.extra?.audio ? await toURL(request.extra.audio) : audio,
            voice_type: request.extra?.voice_type,
            generate_audio: request.extra?.generate_audio,
            use_audio_in_video: request.extra?.use_audio_in_video,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          content: response.text + (response.voice ? `\n\n[Voice]: ${response.voice}` : ""),
          finishReason: 'stop',
        }),
      },
    };
    return transformer;
  })()
}