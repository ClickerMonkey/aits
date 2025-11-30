import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  size: "1024x1024" | "1365x1024" | "1024x1365" | "1536x1024" | "1024x1536" | "1820x1024" | "1024x1820" | "1024x2048" | "2048x1024" | "1434x1024" | "1024x1434" | "1024x1280" | "1280x1024" | "1024x1707" | "1707x1024";
  Input: {
    size?: Schemas["size"];
    style?: Schemas["style"];
    prompt: string;
    aspect_ratio?: Schemas["aspect_ratio"];
  };
  style: "any" | "realistic_image" | "digital_illustration" | "digital_illustration/pixel_art" | "digital_illustration/hand_drawn" | "digital_illustration/grain" | "digital_illustration/infantile_sketch" | "digital_illustration/2d_art_poster" | "digital_illustration/handmade_3d" | "digital_illustration/hand_drawn_outline" | "digital_illustration/engraving_color" | "digital_illustration/2d_art_poster_2" | "realistic_image/b_and_w" | "realistic_image/hard_flash" | "realistic_image/hdr" | "realistic_image/natural_light" | "realistic_image/studio_portrait" | "realistic_image/enterprise" | "realistic_image/motion_blur";
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  aspect_ratio: "Not set" | "1:1" | "4:3" | "3:4" | "3:2" | "2:3" | "16:9" | "9:16" | "1:2" | "2:1" | "7:5" | "5:7" | "4:5" | "5:4" | "3:5" | "5:3";
};

export default {
  "recraft-ai/recraft-v3": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          ...(request.size ? { size: request.size as Schemas["Input"]["size"] } : {}),
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}