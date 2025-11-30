import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    inputs?: string;
  };
  Output: Schemas["NamedEmbedding"][];
  NamedEmbedding: {
    input: string;
    embedding: number[];
  };
};

export default {
  "andreasjansson/clip-features": (() => {
    const transformer: ReplicateTransformer = {
      embed: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          inputs: request.texts.join('\n'),
          ...request.extra,
        }),
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