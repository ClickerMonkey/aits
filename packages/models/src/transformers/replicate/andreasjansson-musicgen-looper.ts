import { toReadableStream } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    bpm?: number;
    seed?: number;
    top_k?: number;
    top_p?: number;
    prompt: string;
    variations?: number;
    temperature?: number;
    max_duration?: number;
    model_version?: Schemas["model_version"];
    output_format?: Schemas["output_format"];
    classifier_free_guidance?: number;
  };
  Output: Schemas["Outputs"];
  Outputs: {
    variation_01?: string;
    variation_02?: string;
    variation_03?: string;
    variation_04?: string;
    variation_05?: string;
    variation_06?: string;
    variation_07?: string;
    variation_08?: string;
    variation_09?: string;
    variation_10?: string;
    variation_11?: string;
    variation_12?: string;
    variation_13?: string;
    variation_14?: string;
    variation_15?: string;
    variation_16?: string;
    variation_17?: string;
    variation_18?: string;
    variation_19?: string;
    variation_20?: string;
  };
  model_version: "medium" | "large";
  output_format: "wav" | "mp3";
};

export default {
  "andreasjansson/musicgen-looper": (() => {
    const transformer: ReplicateTransformer = {
      speech: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => {
          return {
            prompt: request.text,
            output_format: (request.responseFormat === 'mp3' || request.responseFormat === 'wav') 
              ? request.responseFormat 
              : undefined,
            ...request.extra,
          };
        },
        parseResponse: async (response: Schemas["Output"], ctx) => {
          const url = response.variation_01;
          if (!url) throw new Error("No audio generated");
          return {
            audio: await toReadableStream(url),
          };
        },
      },
    };
    return transformer;
  })(),
}