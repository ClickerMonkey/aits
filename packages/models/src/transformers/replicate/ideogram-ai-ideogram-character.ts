import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    mask?: string | null;
    seed?: number | null;
    image?: string | null;
    prompt: string;
    resolution?: Schemas["resolution"];
    style_type?: Schemas["style_type"];
    aspect_ratio?: Schemas["aspect_ratio"];
    rendering_speed?: Schemas["rendering_speed"];
    magic_prompt_option?: Schemas["magic_prompt_option"];
    character_reference_image: string;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  resolution: "None" | "512x1536" | "576x1408" | "576x1472" | "576x1536" | "640x1344" | "640x1408" | "640x1472" | "640x1536" | "704x1152" | "704x1216" | "704x1280" | "704x1344" | "704x1408" | "704x1472" | "736x1312" | "768x1088" | "768x1216" | "768x1280" | "768x1344" | "800x1280" | "832x960" | "832x1024" | "832x1088" | "832x1152" | "832x1216" | "832x1248" | "864x1152" | "896x960" | "896x1024" | "896x1088" | "896x1120" | "896x1152" | "960x832" | "960x896" | "960x1024" | "960x1088" | "1024x832" | "1024x896" | "1024x960" | "1024x1024" | "1088x768" | "1088x832" | "1088x896" | "1088x960" | "1120x896" | "1152x704" | "1152x832" | "1152x864" | "1152x896" | "1216x704" | "1216x768" | "1216x832" | "1248x832" | "1280x704" | "1280x768" | "1280x800" | "1312x736" | "1344x640" | "1344x704" | "1344x768" | "1408x576" | "1408x640" | "1408x704" | "1472x576" | "1472x640" | "1472x704" | "1536x512" | "1536x576" | "1536x640";
  style_type: "Auto" | "Fiction" | "Realistic";
  aspect_ratio: "1:3" | "3:1" | "1:2" | "2:1" | "9:16" | "16:9" | "10:16" | "16:10" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "1:1";
  rendering_speed: "Default" | "Turbo" | "Quality";
  magic_prompt_option: "Auto" | "On" | "Off";
};

export default {
  "ideogram-ai/ideogram-character": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          if (!request.extra?.character_reference_image) {
            throw new Error("character_reference_image is required in extra parameters for ideogram-character");
          }
          return {
            prompt: request.prompt,
            character_reference_image: await toURL(request.extra.character_reference_image),
            seed: request.seed,
            rendering_speed: request.quality === 'low' ? 'Turbo' : request.quality === 'high' ? 'Quality' : 'Default',
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          if (!request.extra?.character_reference_image) {
            throw new Error("character_reference_image is required in extra parameters for ideogram-character");
          }
          return {
            prompt: request.prompt,
            image: await toURL(request.image),
            mask: request.mask ? await toURL(request.mask) : undefined,
            character_reference_image: await toURL(request.extra.character_reference_image),
            seed: request.seed,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}