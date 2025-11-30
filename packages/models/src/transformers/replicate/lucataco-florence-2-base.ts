import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    image: string;
    task_input?: Schemas["task_input"];
    text_input?: string;
  };
  Output: {
    img?: string;
    text: string;
  };
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  task_input: "Caption" | "Detailed Caption" | "More Detailed Caption" | "Caption to Phrase Grounding" | "Object Detection" | "Dense Region Caption" | "Region Proposal" | "OCR" | "OCR with Region";
};

export default {
  "lucataco/florence-2-base": (() => {
    const transformer: ReplicateTransformer = {
      imageAnalyze: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          if (!request.images || request.images.length === 0) {
            throw new Error("Image is required for florence-2-base");
          }
          return {
            image: await toURL(request.images[0]),
            text_input: request.prompt,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          let content = response.text;
          if (response.img) {
            content += `\n\n![Output Image](${response.img})`;
          }
          return {
            content,
            finishReason: 'stop',
          };
        },
      },
    };
    return transformer;
  })(),
}