import { z } from 'zod';
import { globalToolProperties, type CletusAI } from '../ai';

/**
 * Create clerk tools for file operations
 * All operations are relative to CWD
 */
export function createClerkTools(ai: CletusAI) {
  const fileSearch = ai.tool({
    name: 'file_search',
    description: 'Search for files using glob patterns',
    instructions: `Use this to find files by pattern. Supports glob syntax like "**/*.ts", "src/**/*.json". Returns up to the specified limit with optional offset for pagination.
This ONLY lists files, it does NOT read their content.

Example: Find all TypeScript files in src directory:
{ "glob": "src/**/*.ts", "limit": 10 }`,
    schema: z.object({
      glob: z.string().describe('Glob pattern (e.g., "**/*.ts", "src/**/*.json")'),
      limit: z.number().optional().describe('Maximum results (default: 50)'),
      offset: z.number().optional().describe('Starting position for results (default: 0)'),
      ...globalToolProperties,
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'file_search', input }, ctx),
  });

  const fileSummary = ai.tool({
    name: 'file_summary',
    description: 'Generate AI summary of a file',
    instructions: `Use this to get a high-level summary of a file without reading the full content. Supports text files, PDFs, Office docs, and images (with description/transcription).

Example: Summarize a PDF document:
{ "path": "docs/report.pdf", "characterLimit": 32000 }`,
    schema: z.object({
      path: z.string().describe('Relative file path'),
      limit: z.number().optional().describe('Maximum summary length in characters/lines (default: 64,000 chars or 1000 lines - whatever is smaller)'),
      offset: z.number().optional().describe('Character offset to start summary from (default: 0). This can be a negative number meaning it will start from the end of the file.'),
      limitOffsetMode: z.enum(['characters', 'lines']).optional().describe('Whether limit & offset are in characters or lines (default: "characters")'),
      describeImages: z.boolean().optional().describe('Generate descriptions for images (default: false)'),
      extractImages: z.boolean().optional().describe('Extract images from documents (default: false)'),
      transcribeImages: z.boolean().optional().describe('OCR text from images (default: false)'),
      ...globalToolProperties,
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'file_summary', input }, ctx),
  });

  const fileIndex = ai.tool({
    name: 'file_index',
    description: 'Index files for semantic search by content or summary',
    instructions: `Use this to index files for semantic search. Choose "content" to embed the full text in chunks, or "summary" to embed an AI-generated summary. Supports image description and OCR.

Example 1: Index all markdown files by content:
{ "glob": "**/*.md", "index": "content" }

Example 2: Index images with descriptions:
{ "glob": "images/**/*.jpg", "index": "summary", "describeImages": true }`,
    schema: z.object({
      glob: z.string().describe('Glob pattern for files to index'),
      index: z.enum(['content', 'summary']).describe('Index mode: "content" embeds full text in chunks, "summary" embeds AI summary'),
      describeImages: z.boolean().optional().describe('Generate descriptions for images (default: false)'),
      extractImages: z.boolean().optional().describe('Extract images from documents (default: false)'),
      transcribeImages: z.boolean().optional().describe('OCR text from images (default: false)'),
      ...globalToolProperties,
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'file_index', input }, ctx),
  });

  const fileCreate = ai.tool({
    name: 'file_create',
    description: 'Create a new file with content',
    instructions: `Use this to create a new file. Fails if file already exists. Parent directories will be created automatically if needed.

Example: Create a new configuration file:
{ "path": "config/settings.json", "content": "{\\"theme\\": \\"dark\\", \\"fontSize\\": 14}" }`,
    schema: z.object({
      path: z.string().describe('Relative file path'),
      content: z.string().describe('File content'),
      ...globalToolProperties,
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'file_create', input }, ctx),
  });

  const fileCopy = ai.tool({
    name: 'file_copy',
    description: 'Copy files matching glob pattern to target location',
    instructions: `Use this to duplicate one or more files. If copying multiple files, target must be a directory. Target directories will be created if needed.

Example: Copy all config files to backup directory:
{ "glob": "config/*.json", "target": "backup/config/" }`,
    schema: z.object({
      glob: z.string().describe('Glob pattern for files to copy'),
      target: z.string().describe('Destination file path or directory'),
      ...globalToolProperties,
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'file_copy', input }, ctx),
  });

  const fileMove = ai.tool({
    name: 'file_move',
    description: 'Move files matching glob pattern to target',
    instructions: `Use this to move one or more files. Can move to a directory or rename a single file. If moving multiple files, target must be a directory.

Example 1: Rename a single file:
{ "glob": "old-name.ts", "target": "new-name.ts" }

Example 2: Move multiple files into a directory:
{ "glob": "temp/*.log", "target": "archive/" }`,
    schema: z.object({
      glob: z.string().describe('Glob pattern for files to move'),
      target: z.string().describe('Destination directory or file'),
      ...globalToolProperties,
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'file_move', input }, ctx),
  });

  const fileStats = ai.tool({
    name: 'file_stats',
    description: 'Get file statistics and metadata',
    instructions: `Use this to get metadata about a file (size, timestamps, type, line/character counts for text files).

Example: Get stats for a source file:
{ "path": "src/index.ts" }`,
    schema: z.object({
      path: z.string().describe('Relative file path'),
      ...globalToolProperties,
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'file_stats', input }, ctx),
  });

  const fileDelete = ai.tool({
    name: 'file_delete',
    description: 'Delete a file',
    instructions: `Use this to permanently delete a file. This cannot be undone.

Example: Delete a temporary file:
{ "path": "temp/cache.tmp" }`,
    schema: z.object({
      path: z.string().describe('Relative file path'),
      ...globalToolProperties,
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'file_delete', input }, ctx),
  });

  const fileRead = ai.tool({
    name: 'file_read',
    description: 'Read file content',
    instructions: `Use this to read a file into context. Supports text files, PDFs, Office docs, and images (with description/transcription). Large files can be truncated using characterLimit.

Example: Read a source file:
{ "path": "src/main.ts" }`,
    schema: z.object({
      path: z.string().describe('Relative file path'),
      limit: z.number().optional().describe('Maximum summary length in characters/lines (default: 64,000 chars or 1000 lines - whatever is smaller)'),
      offset: z.number().optional().describe('Character offset to start reading from (default: 0). This can be a negative number meaning it will start from the end of the file.'),
      limitOffsetMode: z.enum(['characters', 'lines']).default('characters').describe('Whether limit & offset are in characters or lines (default: "characters")'),
      showLines: z.boolean().optional().describe('Include line numbers in output (default: false)'),
      describeImages: z.boolean().optional().describe('Generate descriptions for images (default: false)'),
      extractImages: z.boolean().optional().describe('Extract images from documents (default: false)'),
      transcribeImages: z.boolean().optional().describe('OCR text from images (default: false)'),
      ...globalToolProperties,
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'file_read', input }, ctx),
  });

  const fileEdit = ai.tool({
    name: 'file_edit',
    description: 'Edit a text file using AI-powered content generation',
    instructions: `Use this to edit text files by providing a detailed request describing the changes. The AI will read the current content (with pagination support), generate new content based on your request, and create a unified diff showing exactly what will change.

Only works on text files. The request should be precise with specific rules and instructions. Do not leave out any details, be as explicit as possible. Do not mistranslate any specific user requests.

Example 1: Modify a configuration file:
{ "path": "config/settings.json", "request": "Add a new field 'maxRetries' with value 3, and change 'timeout' from 5000 to 10000" }

Example 2: Edit a specific section of a large file (by line numbers):
{ "path": "src/utils.ts", "request": "Refactor the parseDate function to handle ISO 8601 format", "offset": 100, "limit": 50 }`,
    schema: z.object({
      path: z.string().describe('Relative file path to edit'),
      request: z.string().describe('Detailed request describing the changes to make. Be precise with rules and requirements.'),
      offset: z.number().optional().describe('Line offset to start editing from (default: 0). Negative numbers start from the end.'),
      limit: z.number().optional().describe('Maximum lines to edit (default: 1000 lines)'),
      ...globalToolProperties,
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'file_edit', input }, ctx),
  });

  const textSearch = ai.tool({
    name: 'text_search',
    description: 'Search for regex pattern in files',
    instructions: `Use this to find text patterns across multiple files. Returns matches with surrounding context lines. Supports OCR for images.

The output can be customized to return different formats:
- "file-count": Number of files with matches
- "files": List of files and match count per file
- "match-count": Total number of matches found
- "matches": Detailed match information with context per file

The output can also be paged using the offset parameter. 
That way if an initial file search determines too many files that match the glob, the text search can be called repeatedly with increasing offsets to get all matches. 
It may also be useful if the user doesn't want a comprehensive list of matches, but rather just a sample or to know any exist.
The offset & limit are at the file level assuming the files are sorted by name.

Example: Find all function declarations in TypeScript files:
{ "glob": "src/**/*.ts", "regex": "function \\w+\\(", "caseInsensitive": true, "output": "matches", "surrounding": 2 }`,
    schema: z.object({
      glob: z.string().describe('Glob pattern for files to search'),
      regex: z.string().describe('Regular expression pattern, EMCA syntax'),
      caseInsensitive: z.boolean().optional().describe('Case insensitive search (default: true)'),
      output: z.enum(['file-count', 'files', 'match-count', 'matches']).optional().describe('Output format (default: "matches")'),
      surrounding: z.number().optional().describe('Lines of context around match (default: 0)'),
      transcribeImages: z.boolean().optional().describe('OCR text from images before searching (default: false). This may be slow and costly so the user should be prompted for permission if not done so yet.'),
      offset: z.number().optional().describe('Starting position for results (default: 0)'),
      limit: z.number().optional().describe('Maximum results (default: 0 = unlimited)'),
      ...globalToolProperties,
    }),
    validate: (input) => {
      try {
        new RegExp(input.regex);
      } catch (error: any) {
        throw new Error(`Invalid regular expression: ${input.regex}`, { cause: error });
      }
    },
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'text_search', input }, ctx),
  });

  const dirCreate = ai.tool({
    name: 'dir_create',
    description: 'Create a directory',
    instructions: `Use this to create a directory. Fails if directory already exists. Parent directories will be created automatically.

Example: Create a new feature directory:
{ "path": "src/features/auth" }`,
    schema: z.object({
      path: z.string().describe('Relative directory path'),
      ...globalToolProperties,
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'dir_create', input }, ctx),
  });

  const fileAttach = ai.tool({
    name: 'file_attach',
    description: 'Attach a text, audio, or PDF file to the chat for the user & AI assistant to see',
    instructions: `Use this to attach a file to the chat conversation. The file will be added as a user message. Only text, audio, and PDF files are allowed. Path is relative to current working directory.

Example: Attach a document:
{ "path": "documents/report.pdf" }`,
    schema: z.object({
      path: z.string().describe('Relative path to the text, audio, or PDF file to attach'),
      ...globalToolProperties,
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'file_attach', input }, ctx),
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
    fileEdit,
    textSearch,
    dirCreate,
    fileAttach,
  ] as [
    typeof fileSearch,
    typeof fileSummary,
    typeof fileIndex,
    typeof fileCreate,
    typeof fileCopy,
    typeof fileMove,
    typeof fileStats,
    typeof fileDelete,
    typeof fileRead,
    typeof fileEdit,
    typeof textSearch,
    typeof dirCreate,
    typeof fileAttach,
  ];
}
