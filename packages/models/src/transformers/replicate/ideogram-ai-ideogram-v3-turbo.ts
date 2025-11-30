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
    style_preset?: Schemas["style_preset"];
    magic_prompt_option?: Schemas["magic_prompt_option"];
    style_reference_images?: string[] | null;
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  resolution: "None" | "512x1536" | "576x1408" | "576x1472" | "576x1536" | "640x1344" | "640x1408" | "640x1472" | "640x1536" | "704x1152" | "704x1216" | "704x1280" | "704x1344" | "704x1408" | "704x1472" | "736x1312" | "768x1088" | "768x1216" | "768x1280" | "768x1344" | "800x1280" | "832x960" | "832x1024" | "832x1088" | "832x1152" | "832x1216" | "832x1248" | "864x1152" | "896x960" | "896x1024" | "896x1088" | "896x1120" | "896x1152" | "960x832" | "960x896" | "960x1024" | "960x1088" | "1024x832" | "1024x896" | "1024x960" | "1024x1024" | "1088x768" | "1088x832" | "1088x896" | "1088x960" | "1120x896" | "1152x704" | "1152x832" | "1152x864" | "1152x896" | "1216x704" | "1216x768" | "1216x832" | "1248x832" | "1280x704" | "1280x768" | "1280x800" | "1312x736" | "1344x640" | "1344x704" | "1344x768" | "1408x576" | "1408x640" | "1408x704" | "1472x576" | "1472x640" | "1472x704" | "1536x512" | "1536x576" | "1536x640";
  style_type: "None" | "Auto" | "General" | "Realistic" | "Design";
  aspect_ratio: "1:3" | "3:1" | "1:2" | "2:1" | "9:16" | "16:9" | "10:16" | "16:10" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "1:1";
  style_preset: "None" | "80s Illustration" | "90s Nostalgia" | "Abstract Organic" | "Analog Nostalgia" | "Art Brut" | "Art Deco" | "Art Poster" | "Aura" | "Avant Garde" | "Bauhaus" | "Blueprint" | "Blurry Motion" | "Bright Art" | "C4D Cartoon" | "Children's Book" | "Collage" | "Coloring Book I" | "Coloring Book II" | "Cubism" | "Dark Aura" | "Doodle" | "Double Exposure" | "Dramatic Cinema" | "Editorial" | "Emotional Minimal" | "Ethereal Party" | "Expired Film" | "Flat Art" | "Flat Vector" | "Forest Reverie" | "Geo Minimalist" | "Glass Prism" | "Golden Hour" | "Graffiti I" | "Graffiti II" | "Halftone Print" | "High Contrast" | "Hippie Era" | "Iconic" | "Japandi Fusion" | "Jazzy" | "Long Exposure" | "Magazine Editorial" | "Minimal Illustration" | "Mixed Media" | "Monochrome" | "Nightlife" | "Oil Painting" | "Old Cartoons" | "Paint Gesture" | "Pop Art" | "Retro Etching" | "Riviera Pop" | "Spotlight 80s" | "Stylized Red" | "Surreal Collage" | "Travel Poster" | "Vintage Geo" | "Vintage Poster" | "Watercolor" | "Weird" | "Woodblock Print";
  magic_prompt_option: "Auto" | "On" | "Off";
};

export default {
  "ideogram-ai/ideogram-v3-turbo": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: Schemas["Input"] = {
            prompt: request.prompt,
            seed: request.seed,
            ...request.extra,
          };
          if (request.size) {
            if (request.size.includes(':')) {
              input.aspect_ratio = request.size as Schemas["aspect_ratio"];
            } else if (request.size.includes('x')) {
              input.resolution = request.size as Schemas["resolution"];
            }
          }
          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: [{ url: await toURL(response) }],
          };
        },
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: Schemas["Input"] = {
            prompt: request.prompt,
            image: await toURL(request.image),
            mask: request.mask ? await toURL(request.mask) : undefined,
            seed: request.seed,
            ...request.extra,
          };
          if (request.size) {
            if (request.size.includes(':')) {
              input.aspect_ratio = request.size as Schemas["aspect_ratio"];
            } else if (request.size.includes('x')) {
              input.resolution = request.size as Schemas["resolution"];
            }
          }
          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            images: [{ url: await toURL(response) }],
          };
        },
      },
    };
    return transformer;
  })(),
}