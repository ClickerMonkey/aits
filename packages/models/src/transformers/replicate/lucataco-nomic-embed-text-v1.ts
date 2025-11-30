import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    sentences: string;
  };
  Output: number[][];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
};

export default {
  "lucataco/nomic-embed-text-v1": (() => {
    const transformer: ReplicateTransformer = {
      embed: {
        convertRequest: async (request, ctx) => ({
          sentences: request.texts.join('\n'),
          ...request.extra,
        }),
        parseResponse: async (response: number[][], ctx) => ({
          embeddings: response.map((embedding, index) => ({
            embedding,
            index,
          })),
        }),
      },
    };
    return transformer;
  })(),
}