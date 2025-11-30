import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  mode: "general" | "character" | "style" | "product";
  Input: {
    mode?: Schemas["mode"];
    priority?: Schemas["priority"];
    lora_rank?: Schemas["lora_rank"];
    captioning?: Schemas["captioning"];
    input_images?: string;
    trigger_word?: string;
    finetune_type?: Schemas["finetune_type"];
    learning_rate?: number;
    training_steps?: Schemas["training_steps"];
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  priority: "speed" | "quality" | "high_res_only";
  lora_rank: 16 | 32;
  captioning: "automatic" | "captioning-enabled" | "captioning-disabled";
  finetune_type: "lora" | "full";
  training_steps: 149 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000;
};

export default {
  "black-forest-labs/flux-pro-trainer": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          trigger_word: request.prompt,
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: response }],
        }),
      },
    };
    return transformer;
  })(),
}