import { toURL } from '@aeye/core';
import { ReplicateTransformer } from '@aeye/replicate';



export default {
  "comfyui/any-comfyui-workflow": (() => {
    const transformer: ReplicateTransformer = {
      imageGenerate: {
        convertRequest: async (request, ctx) => ({
          workflow_json: request.extra?.workflow_json,
          input_file: request.extra?.input_file,
          output_format: request.extra?.output_format,
          output_quality: request.extra?.output_quality,
          randomise_seeds: request.extra?.randomise_seeds,
          force_reset_cache: request.extra?.force_reset_cache,
          return_temp_files: request.extra?.return_temp_files,
          ...request.extra,
        }),
        parseResponse: async (response, ctx) => ({
          images: await Promise.all((response as string[]).map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx) => ({
          workflow_json: request.extra?.workflow_json,
          input_file: await toURL(request.image),
          output_format: request.extra?.output_format,
          output_quality: request.extra?.output_quality,
          randomise_seeds: request.extra?.randomise_seeds,
          force_reset_cache: request.extra?.force_reset_cache,
          return_temp_files: request.extra?.return_temp_files,
          ...request.extra,
        }),
        parseResponse: async (response, ctx) => ({
          images: await Promise.all((response as string[]).map(async (url) => ({ url: await toURL(url) }))),
        }),
      },
    };
    return transformer;
  })(),
}