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
  style: "any" | "engraving" | "line_art" | "line_circuit" | "linocut";
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  aspect_ratio: "Not set" | "1:1" | "4:3" | "3:4" | "3:2" | "2:3" | "16:9" | "9:16" | "1:2" | "2:1" | "7:5" | "5:7" | "4:5" | "5:4" | "3:5" | "5:3";
};

export default {
  "recraft-ai/recraft-v3-svg": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          size: request.size as Schemas["size"],
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