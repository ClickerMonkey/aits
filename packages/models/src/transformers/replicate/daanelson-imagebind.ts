import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    input?: string;
    modality?: Schemas["modality"];
    text_input?: string;
  };
  Output: number[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  modality: "text" | "vision" | "audio";
};

export default {
  "daanelson/imagebind": (() => {
    const transformer: ReplicateTransformer = { 
      embed: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const extra = request.extra || {};
          // If explicit file input is provided in extra, prioritize it (for vision/audio)
          if (extra.input) {
            return { 
              input: await toURL(extra.input),
              modality: extra.modality || "vision",
              ...extra,
            };
          }
          // Default to text input from the standard EmbeddingRequest
          return {
            text_input: request.texts?.[0],
            modality: "text",
            ...extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          embeddings: [{
            embedding: response,
            index: 0
          }],
        }),
      },
    };
    return transformer;
  })()
}