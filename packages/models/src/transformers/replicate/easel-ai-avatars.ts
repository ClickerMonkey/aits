import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';

type Schemas = {
  Input: {
    prompt?: string;
    face_image: string;
    user_gender?: Schemas["user_gender"];
    face_image_b?: string;
    user_b_gender?: Schemas["user_b_gender"];
    workflow_type?: Schemas["workflow_type"];
  };
  Output: string;
  Status: "starting" | "processing" | "succeeded" | "canceled" | "failed";
  user_gender: "male" | "female" | "non_binary";
  user_b_gender: "male" | "female" | "non_binary";
  workflow_type: "HyperRealistic" | "Realistic" | "Stylistic";
};

export default {
  // this key comes from modelData.owner/modelData.name
  // // The definition is wrapped in an immediately-invoked function expression so any cached or reusable functions can be defined here.
  "easel/ai-avatars": (() => {
    // you must use this ReplicateTransformer type to avoid TypeScript errors
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        // only use variable known to be in this request type based on the types below
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          face_image: request.extra?.face_image as string,
          ...request.extra,
        }),
        // only use known output schema from the model and only use properties expected on the response type based on the types below
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx): Promise<Schemas["Input"]> => ({
          prompt: request.prompt,
          face_image: await toURL(request.image),
          ...request.extra,
        }),
        parseResponse: async (response: Schemas["Output"], ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(), // immediately invoke the function to return the typed transformer
}