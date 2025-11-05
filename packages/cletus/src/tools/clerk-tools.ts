import { z } from 'zod';
import type { CletusAI } from '../ai.js';

/**
 * Create clerk tools for file operations
 * All operations are relative to CWD
 */
export function createClerkTools(ai: CletusAI) {
  const fileSearch = ai.tool({
    name: 'file_search',
    description: 'Search for files using glob patterns',
    instructions: 'Use this to find files by pattern. Supports glob syntax like "**/*.ts", "src/**/*.json". Returns up to the specified limit with optional offset for pagination.',
    schema: z.object({
      glob: z.string().describe('Glob pattern (e.g., "**/*.ts", "src/**/*.json")'),
      limit: z.number().optional().describe('Maximum results (default: 50)'),
      offset: z.number().optional().describe('Starting position for results (default: 0)'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'file_search', input }, ctx),
  });

  const fileSummary = ai.tool({
    name: 'file_summary',
    description: 'Generate AI summary of a file',
    instructions: 'Use this to get a high-level summary of a file without reading the full content. Supports text files, PDFs, Office docs, and images (with description/transcription).',
    schema: z.object({
      path: z.string().describe('Relative file path'),
      characterLimit: z.number().optional().describe('Max characters to process (default: 64000)'),
      describeImages: z.boolean().optional().describe('Generate descriptions for images (default: false)'),
      extractImages: z.boolean().optional().describe('Extract images from documents (default: false)'),
      transcribeImages: z.boolean().optional().describe('OCR text from images (default: false)'),
    }),
    call: async (params, refs, ctx) => {
      return await ctx.ops.handle({
        type: 'file_summary',
        input: {
          path: params.path,
          characterLimit: params.characterLimit,
          describeImages: params.describeImages,
          extractImages: params.extractImages,
          transcribeImages: params.transcribeImages,
        }
      }, ctx);
    },
  });

  const fileIndex = ai.tool({
    name: 'file_index',
    description: 'Index files for semantic search by content or summary',
    instructions: 'Use this to index files for semantic search. Choose "content" to embed the full text in chunks, or "summary" to embed an AI-generated summary. Supports image description and OCR.',
    schema: z.object({
      glob: z.string().describe('Glob pattern for files to index'),
      index: z.enum(['content', 'summary']).describe('Index mode: "content" embeds full text in chunks, "summary" embeds AI summary'),
      describeImages: z.boolean().optional().describe('Generate descriptions for images (default: false)'),
      extractImages: z.boolean().optional().describe('Extract images from documents (default: false)'),
      transcribeImages: z.boolean().optional().describe('OCR text from images (default: false)'),
    }),
    call: async (params, refs, ctx) => {
      return await ctx.ops.handle({
        type: 'file_index',
        input: {
          glob: params.glob,
          index: params.index,
          describeImages: params.describeImages,
          extractImages: params.extractImages,
          transcribeImages: params.transcribeImages,
        }
      }, ctx);
    },
  });

  const fileCreate = ai.tool({
    name: 'file_create',
    description: 'Create a new file with content',
    instructions: 'Use this to create a new file. Fails if file already exists. Parent directories will be created automatically if needed.',
    schema: z.object({
      path: z.string().describe('Relative file path'),
      content: z.string().describe('File content'),
    }),
    call: async (params, refs, ctx) => {
      return await ctx.ops.handle({
        type: 'file_create',
        input: {
          path: params.path,
          content: params.content,
        }
      }, ctx);
    },
  });

  const fileCopy = ai.tool({
    name: 'file_copy',
    description: 'Copy files matching glob pattern to target location',
    instructions: 'Use this to duplicate one or more files. If copying multiple files, target must be a directory. Target directories will be created if needed.',
    schema: z.object({
      glob: z.string().describe('Glob pattern for files to copy'),
      target: z.string().describe('Destination file path or directory'),
    }),
    call: async (params, refs, ctx) => {
      return await ctx.ops.handle({
        type: 'file_copy',
        input: {
          glob: params.glob,
          target: params.target,
        }
      }, ctx);
    },
  });

  const fileMove = ai.tool({
    name: 'file_move',
    description: 'Move files matching glob pattern to target',
    instructions: 'Use this to move one or more files. Can move to a directory or rename a single file. If moving multiple files, target must be a directory.',
    schema: z.object({
      glob: z.string().describe('Glob pattern for files to move'),
      target: z.string().describe('Destination directory or file'),
    }),
    call: async (params, refs, ctx) => {
      return await ctx.ops.handle({
        type: 'file_move',
        input: {
          glob: params.glob,
          target: params.target,
        }
      }, ctx);
    },
  });

  const fileStats = ai.tool({
    name: 'file_stats',
    description: 'Get file statistics and metadata',
    instructions: 'Use this to get metadata about a file (size, timestamps, type, line/character counts for text files).',
    schema: z.object({
      path: z.string().describe('Relative file path'),
    }),
    call: async (params, refs, ctx) => {
      return await ctx.ops.handle({
        type: 'file_stats',
        input: {
          path: params.path,
        }
      }, ctx);
    },
  });

  const fileDelete = ai.tool({
    name: 'file_delete',
    description: 'Delete a file',
    instructions: 'Use this to permanently delete a file. This cannot be undone.',
    schema: z.object({
      path: z.string().describe('Relative file path'),
    }),
    call: async (params, refs, ctx) => {
      return await ctx.ops.handle({
        type: 'file_delete',
        input: {
          path: params.path,
        }
      }, ctx);
    },
  });

  const fileRead = ai.tool({
    name: 'file_read',
    description: 'Read file content',
    instructions: 'Use this to read a file into context. Supports text files, PDFs, Office docs, and images (with description/transcription). Large files can be truncated using characterLimit.',
    schema: z.object({
      path: z.string().describe('Relative file path'),
      characterLimit: z.number().optional().describe('Max characters to read (default: 64000)'),
      describeImages: z.boolean().optional().describe('Generate descriptions for images (default: false)'),
      extractImages: z.boolean().optional().describe('Extract images from documents (default: false)'),
      transcribeImages: z.boolean().optional().describe('OCR text from images (default: false)'),
    }),
    call: async (params, refs, ctx) => {
      return await ctx.ops.handle({
        type: 'file_read',
        input: {
          path: params.path,
          characterLimit: params.characterLimit,
          describeImages: params.describeImages,
          extractImages: params.extractImages,
          transcribeImages: params.transcribeImages,
        }
      }, ctx);
    },
  });

  const textSearch = ai.tool({
    name: 'text_search',
    description: 'Search for regex pattern in files',
    instructions: 'Use this to find text patterns across multiple files. Returns matches with surrounding context lines. Supports OCR for images.',
    schema: z.object({
      glob: z.string().describe('Glob pattern for files to search'),
      regex: z.string().describe('Regular expression pattern'),
      surrounding: z.number().optional().describe('Lines of context around match (default: 0)'),
      transcribeImages: z.boolean().optional().describe('OCR text from images before searching (default: false)'),
    }),
    call: async (params, refs, ctx) => {
      return await ctx.ops.handle({
        type: 'text_search',
        input: {
          glob: params.glob,
          regex: params.regex,
          surrounding: params.surrounding,
          transcribeImages: params.transcribeImages,
        }
      }, ctx);
    },
  });

  const dirCreate = ai.tool({
    name: 'dir_create',
    description: 'Create a directory',
    instructions: 'Use this to create a directory. Fails if directory already exists. Parent directories will be created automatically.',
    schema: z.object({
      path: z.string().describe('Relative directory path'),
    }),
    call: async (params, refs, ctx) => {
      return await ctx.ops.handle({
        type: 'dir_create',
        input: {
          path: params.path,
        }
      }, ctx);
    },
  });

  return [
    fileSearch,
    fileSummary,
    fileIndex,
    fileCreate,
    fileCopy,
    fileMove,
    fileStats,
    fileDelete,
    fileRead,
    textSearch,
    dirCreate,
  ] as const;
}
