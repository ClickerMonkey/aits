import { z } from 'zod';
import type { CletusAI } from '../ai.js';
import type { Operation } from '../schemas.js';

/**
 * Create clerk tools for file operations
 * All operations are relative to CWD, only text files
 * Tools return operations that will be executed based on chat mode
 */
export function createClerkTools(ai: CletusAI) {
  const fileSearch = ai.tool({
    name: 'file_search',
    description: 'Search for files using glob patterns',
    instructions: 'Use this to find files by pattern. Supports glob syntax like "**/*.ts", "src/**/*.json". Returns up to the specified limit.',
    schema: z.object({
      glob: z.string().describe('Glob pattern (e.g., "**/*.ts", "src/**/*.json")'),
      limit: z.number().optional().describe('Maximum results (default: 40)'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'file_search',
        input: {
          glob: params.glob,
          limit: params.limit || 40,
        },
        kind: 'read',
      };
    },
  });

  const fileSummary = ai.tool({
    name: 'file_summary',
    description: 'Generate AI summary of a file (first 64k characters)',
    instructions: 'Use this to get a high-level summary of a file without reading the full content. The summary will be generated and can be stored in knowledge.',
    schema: z.object({
      path: z.string().describe('Relative file path'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'file_summary',
        input: {
          path: params.path,
        },
        kind: 'read',
      };
    },
  });

  const fileIndex = ai.tool({
    name: 'file_index',
    description: 'Break file into sections and generate knowledge entries',
    instructions: 'Use this to index a file for semantic search. The file will be split into chunks and embedded. In modes lower than "create", this only reports how many entries would be created.',
    schema: z.object({
      path: z.string().describe('Relative file path'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'file_index',
        input: {
          path: params.path,
        },
        kind: 'create',
      };
    },
  });

  const fileCreate = ai.tool({
    name: 'file_create',
    description: 'Create a new file with content',
    instructions: 'Use this to create a new file. Parent directories will be created automatically if needed.',
    schema: z.object({
      path: z.string().describe('Relative file path'),
      content: z.string().describe('File content'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'file_create',
        input: {
          path: params.path,
          content: params.content,
        },
        kind: 'create',
      };
    },
  });

  const fileCopy = ai.tool({
    name: 'file_copy',
    description: 'Copy a file to a new location',
    instructions: 'Use this to duplicate a file. Target directories will be created if needed.',
    schema: z.object({
      path: z.string().describe('Source file path'),
      target: z.string().describe('Destination file path'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'file_copy',
        input: {
          path: params.path,
          target: params.target,
        },
        kind: 'create',
      };
    },
  });

  const fileMove = ai.tool({
    name: 'file_move',
    description: 'Move files matching glob pattern to target',
    instructions: 'Use this to move one or more files. Can move to a directory or rename a single file.',
    schema: z.object({
      glob: z.string().describe('Glob pattern for files to move'),
      target: z.string().describe('Destination directory or file'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'file_move',
        input: {
          glob: params.glob,
          target: params.target,
        },
        kind: 'update',
      };
    },
  });

  const fileStats = ai.tool({
    name: 'file_stats',
    description: 'Get file statistics',
    instructions: 'Use this to get metadata about a file (size, timestamps, type).',
    schema: z.object({
      path: z.string().describe('Relative file path'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'file_stats',
        input: {
          path: params.path,
        },
        kind: 'read',
      };
    },
  });

  const fileDelete = ai.tool({
    name: 'file_delete',
    description: 'Delete a file',
    instructions: 'Use this to permanently delete a file. This cannot be undone.',
    schema: z.object({
      path: z.string().describe('Relative file path'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'file_delete',
        input: {
          path: params.path,
        },
        kind: 'delete',
      };
    },
  });

  const fileRead = ai.tool({
    name: 'file_read',
    description: 'Read file content (first 64k characters)',
    instructions: 'Use this to read a file into context. Large files will be truncated.',
    schema: z.object({
      path: z.string().describe('Relative file path'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'file_read',
        input: {
          path: params.path,
        },
        kind: 'read',
      };
    },
  });

  const textSearch = ai.tool({
    name: 'text_search',
    description: 'Search for regex pattern in files',
    instructions: 'Use this to find text patterns across multiple files. Returns matches with surrounding context lines.',
    schema: z.object({
      glob: z.string().describe('Glob pattern for files to search'),
      regex: z.string().describe('Regular expression pattern'),
      surrounding: z.number().optional().describe('Lines of context around match (default: 2)'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'text_search',
        input: {
          glob: params.glob,
          regex: params.regex,
          surrounding: params.surrounding || 2,
        },
        kind: 'read',
      };
    },
  });

  const dirCreate = ai.tool({
    name: 'dir_create',
    description: 'Create a directory',
    instructions: 'Use this to create a directory. Parent directories will be created automatically.',
    schema: z.object({
      path: z.string().describe('Relative directory path'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'dir_create',
        input: {
          path: params.path,
        },
        kind: 'create',
      };
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
  ];
}
