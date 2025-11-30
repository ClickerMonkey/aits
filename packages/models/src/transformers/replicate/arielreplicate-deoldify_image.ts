import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    model_name: Schemas["model_name"];
    input_image: string;
    render_factor?: number;
  };
  Output: string;
  model_name: "Artistic" | "Stable";
};

export default {
  "arielreplicate/deoldify_image": (() => {
    const transformer: ReplicateTransformer = {
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          input_image: await toURL(request.image),
          model_name: request.extra?.model_name ?? "Artistic",
          render_factor: request.extra?.render_factor,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}