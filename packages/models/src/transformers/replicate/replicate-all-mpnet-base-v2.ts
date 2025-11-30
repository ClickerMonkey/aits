import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    text?: string;
    text_batch?: string;
  };
  Output: Schemas["Embedding"][];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  Embedding: {
    embedding: number[];
  };
};

export default {
  "replicate/all-mpnet-base-v2": (() => {
    const transformer: ReplicateTransformer = {
      embed: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          if (request.texts.length > 1) {
            return {
              text_batch: JSON.stringify(request.texts),
              ...request.extra,
            };
          }
          return {
            text: request.texts[0],
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          embeddings: response.map((item, index) => ({
            embedding: item.embedding,
            index,
          })),
        }),
      },
    };
    return transformer;
  })(),
}