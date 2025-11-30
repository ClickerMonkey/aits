import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    text?: string;
    image?: string;
    embedding_dim?: number;
    output_format?: Schemas["output_format"];
  };
  Output: (string | number[])[];
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  output_format: "base64" | "array";
};

export default {
  "zsxkib/jina-clip-v2": (() => {
    const transformer: ReplicateTransformer = {
      embed: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          const { image, ...restExtra } = request.extra || {};
          const input: Schemas["Input"] = {
            text: request.texts?.[0],
            embedding_dim: request.dimensions,
            output_format: "array",
            ...restExtra,
          };

          if (image) {
            input.image = await toURL(image);
          }

          return input;
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          // response is (string | number[])[]
          // We requested 'array', so we cast to number[]
          const embeddings = response.map((emb, index) => ({
            embedding: emb as number[],
            index,
          }));
          return { embeddings };
        },
      },
    };
    return transformer;
  })(),
}