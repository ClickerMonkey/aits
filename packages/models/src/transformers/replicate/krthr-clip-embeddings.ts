import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    text?: string;
    image?: string;
  };
  Output: {
    embedding: number[];
  };
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "krthr/clip-embeddings": (() => {
    const transformer: ReplicateTransformer = {
      embed: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const input: Schemas["Input"] = {
            ...request.extra,
          };
          // Map the first text from the request to the model's text input
          if (request.texts && request.texts.length > 0) {
            input.text = request.texts[0];
          }
          // Handle image input if provided in extra (common for CLIP models)
          if (request.extra?.image) {
            input.image = await toURL(request.extra.image);
          }
          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          return {
            embeddings: [
              {
                embedding: response.embedding,
                index: 0,
              },
            ],
          };
        },
      },
    };
    return transformer;
  })(),
}