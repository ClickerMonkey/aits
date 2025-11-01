import { z } from 'zod';
import type { CletusAI } from '../ai.js';
import type { Operation } from '../schemas.js';

/**
 * Create artist tools for image operations
 * Images are stored in .cletus/images/ and referenced via file:// syntax
 */
export function createArtistTools(ai: CletusAI) {
  const imageGenerate = ai.tool({
    name: 'image_generate',
    description: 'Generate one or more images from a text prompt',
    instructions: 'Use this to create new images. Generated images are saved to .cletus/images/ and linked in chat via file:// syntax.',
    schema: z.object({
      prompt: z.string().describe('Text description of the image to generate'),
      n: z.number().default(1).describe('Number of images to generate (default: 1)'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'image_generate',
        input: {
          prompt: params.prompt,
          n: params.n,
        },
        kind: 'create',
      };
    },
  });

  const imageEdit = ai.tool({
    name: 'image_edit',
    description: 'Edit an existing image based on a text prompt',
    instructions: 'Use this to modify an existing image. Can work with images in .cletus/images/ or relative file paths.',
    schema: z.object({
      prompt: z.string().describe('Description of how to edit the image'),
      imagePath: z.string().describe('Path to the image to edit'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'image_edit',
        input: {
          prompt: params.prompt,
          imagePath: params.imagePath,
        },
        kind: 'update',
      };
    },
  });

  const imageAnalyze = ai.tool({
    name: 'image_analyze',
    description: 'Analyze one or more images with AI and answer questions',
    instructions: 'Use this to understand what\'s in images or answer specific questions about them. Can analyze multiple images together.',
    schema: z.object({
      prompt: z.string().describe('Question or analysis request about the images'),
      imagePaths: z.array(z.string()).describe('Paths to images to analyze'),
      maxCharacters: z.number().optional().default(2084).describe('Maximum response length (maxCharacters/4 = maxTokens)'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'image_analyze',
        input: {
          prompt: params.prompt,
          imagePaths: params.imagePaths,
          maxCharacters: params.maxCharacters,
        },
        kind: 'read',
      };
    },
  });

  const imageDescribe = ai.tool({
    name: 'image_describe',
    description: 'Get a detailed description of what\'s in an image',
    instructions: 'Use this to generate a comprehensive description of an image\'s contents.',
    schema: z.object({
      imagePath: z.string().describe('Path to the image to describe'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'image_describe',
        input: {
          imagePath: params.imagePath,
        },
        kind: 'read',
      };
    },
  });

  const imageFind = ai.tool({
    name: 'image_find',
    description: 'Find images matching a description using semantic search',
    instructions: 'Use this to search for images in a directory that match a text description. Each image is analyzed and embedded, then compared to the prompt embedding for scoring.',
    schema: z.object({
      prompt: z.string().describe('Description of what to find in images'),
      glob: z.string().describe('Glob pattern for image files to search'),
      maxImages: z.number().describe('Maximum number of images to analyze'),
      n: z.number().describe('Number of top results to return'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'image_find',
        input: {
          prompt: params.prompt,
          glob: params.glob,
          maxImages: params.maxImages,
          n: params.n,
        },
        kind: 'read',
      };
    },
  });

  return [
    imageGenerate,
    imageEdit,
    imageAnalyze,
    imageDescribe,
    imageFind,
  ];
}
