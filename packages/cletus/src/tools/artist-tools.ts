import { z } from 'zod';
import type { CletusAI } from '../ai.js';

/**
 * Create artist tools for image operations
 * Images are stored in .cletus/images/ and referenced via file:// syntax
 */
export function createArtistTools(ai: CletusAI) {
  const imageGenerate = ai.tool({
    name: 'image_generate',
    description: 'Generate one or more images from a text prompt',
    instructions: 'Use this to create new images. Generated images are saved to .cletus/images/ and returned as file paths.',
    schema: z.object({
      prompt: z.string().describe('Text description of the image to generate'),
      n: z.number().optional().default(1).describe('Number of images to generate (default: 1)'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'image_generate', input }, ctx),
  });

  const imageEdit = ai.tool({
    name: 'image_edit',
    description: 'Edit an existing image based on a text prompt',
    instructions: 'Use this to modify an existing image. Provide a file path (relative or file://) and a description of the edit. The edited image will be saved as a new file.',
    schema: z.object({
      prompt: z.string().describe('Description of how to edit the image'),
      imagePath: z.string().describe('Path to the image to edit (relative path or file:// URL)'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'image_edit', input }, ctx),
  });

  const imageAnalyze = ai.tool({
    name: 'image_analyze',
    description: 'Analyze one or more images with AI and answer questions',
    instructions: 'Use this to understand what\'s in images or answer specific questions about them. Can analyze multiple images together for comparison.',
    schema: z.object({
      prompt: z.string().describe('Question or analysis request about the images'),
      imagePaths: z.array(z.string()).describe('Paths to images to analyze (relative paths or file:// URLs)'),
      maxCharacters: z.number().optional().default(2084).describe('Maximum response length (maxCharacters/4 = maxTokens, default: 2084)'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'image_analyze', input }, ctx),
  });

  const imageDescribe = ai.tool({
    name: 'image_describe',
    description: 'Get a detailed description of what\'s in an image',
    instructions: 'Use this to generate a comprehensive description of an image\'s contents without a specific question.',
    schema: z.object({
      imagePath: z.string().describe('Path to the image to describe (relative path or file:// URL)'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'image_describe', input }, ctx),
  });

  const imageFind = ai.tool({
    name: 'image_find',
    description: 'Find images matching a description using semantic search',
    instructions: 'Use this to search for images in a directory that match a text description. Each image is analyzed and embedded, then compared to the prompt embedding for similarity scoring. This operation can be slow for large numbers of images.',
    schema: z.object({
      prompt: z.string().describe('Description of what to find in images'),
      glob: z.string().describe('Glob pattern for image files to search (e.g., "**/*.png", "photos/*.jpg")'),
      maxImages: z.number().optional().default(100).describe('Maximum number of images to analyze (default: 100)'),
      n: z.number().optional().default(5).describe('Number of top results to return (default: 5)'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'image_find', input }, ctx),
  });

  return [
    imageGenerate,
    imageEdit,
    imageAnalyze,
    imageDescribe,
    imageFind,
  ] as const;
}
