import { getModel } from "@aits/core";
import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import * as Diff from 'diff';
import { CletusAI, describe, summarize, transcribe } from "../ai";
import { abbreviate, chunkArray, linkFile, paginateText } from "../common";
import { getAssetPath } from "../file-manager";
import { KnowledgeFile } from "../knowledge";
import { KnowledgeEntry } from "../schemas";
import { operationOf } from "./types";
import { CONSTS } from "../constants";
import { renderOperation } from "../helpers/render";
import { categorizeFile, fileExists, fileIsDirectory, fileIsReadable, fileIsWritable, processFile, searchFiles } from "../helpers/files";


export const file_search = operationOf<
  { glob: string; limit?: number, offset?: number },
  { count: number; files: string[] }
>({
  mode: 'local',
  signature: 'file_search(glob: string, limit?: number, offset?: number)',
  status: (input) => `Searching files: ${input.glob}`,
  async analyze(input, { cwd }) { return { analysis: `N/A`, doable: true }; },
  async do(input, { cwd }) {
    const limit = input.limit || 50;
    const offset = input.offset || 0;
    const files = await glob(input.glob, { cwd });

    files.sort();

    return { glob: input.glob, count: files.length, files: files.slice(offset, limit) };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `Files("${op.input.glob}")`,
    (op) => {
      if (op.output) {
        return `Found ${op.output.count} file${op.output.count !== 1 ? 's' : ''}`;
      }
      return null;
    }
  , showInput, showOutput),
});

export const file_summary = operationOf<
  { 
    path: string, 
    limit?: number,
    offset?: number, 
    limitOffsetMode?: 'characters' | 'lines', 
    describeImages?: boolean, 
    extractImages?: boolean, 
    transcribeImages?: boolean,
  },
  { size: number; truncated: boolean; summary: string; }
>({
  mode: 'read',
  signature: 'file_summary(path: string, limit?: number, offset?: number, limitOffsetMode...)',
  status: (input) => `Summarizing: ${path.basename(input.path)}`,
  instructions: 'This is a summary of the file content. The original file content may have specific formatting and whitespace that is not preserved in the summary.',
  analyze: async (input, { cwd }) => {
    const fullPath = path.resolve(cwd, input.path);
    const readable = await fileIsReadable(fullPath);

    if (!readable) {
      return {
        analysis: `This would fail - file "${input.path}" not found or not readable.`,
        doable: false,
      };
    }

    const fileType = await categorizeFile(fullPath, fullPath);
    if (fileType === 'unknown') {
      return {
        analysis: `This would fail - file "${input.path}" is of an unsupported type for summarization.`,
        doable: false,
      };
    }

    const limitOffsetMode = input.limitOffsetMode || 'characters';
    const limit = limitOffsetMode === 'characters'
      ? Math.min(CONSTS.MAX_CHARACTERS, input.limit || CONSTS.MAX_CHARACTERS)
      : Math.min(CONSTS.MAX_LINES, input.limit || CONSTS.MAX_LINES);

    return {
      analysis: `This will read and summarize the ${fileType} file at "${input.path}" (first ${limit.toLocaleString()} ${limitOffsetMode}).`,
      doable: true,
    };
  },
  do: async (input, { cwd, ai, config }) => {
    const fullPath = path.resolve(cwd, input.path);
    
    const summarized = await processFile(fullPath, input.path, {
      assetPath: await getAssetPath(true),
      sections: false,
      describeImages: input.describeImages ?? false,
      extractImages: input.extractImages ?? false,
      transcribeImages: input.transcribeImages ?? false,
      summarize: true,
      summarizer: (text) => summarize(ai, paginateText(text, input.limit, input.offset, input.limitOffsetMode)),
      describer: (image) => describe(ai, image),
      transcriber: (image) => transcribe(ai, image),
    });

    const size = summarized.sections.reduce((acc, sec) => acc + (sec?.length || 0), 0);

    return {
      size,
      truncated: size > Math.min(CONSTS.MAX_CHARACTERS, input.limitOffsetMode === 'lines' ? CONSTS.MAX_CHARACTERS : input.limit || CONSTS.MAX_CHARACTERS),
      summary: summarized.description!,
    };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `Summarize("${paginateText(op.input.path, 100, -100)}")`,
    (op) => {
      if (op.output) {
        return abbreviate(op.output.summary, 60);
      }
      return null;
    }
  , showInput, showOutput),
});

export const file_index = operationOf<
  { glob: string, index: 'content' | 'summary', describeImages?: boolean, extractImages?: boolean, transcribeImages?: boolean },
  { files: string[], knowledge: number }
>({
  mode: 'create',
  signature: 'file_index(glob: string, index: "content" | "summary"...)',
  status: (input) => `Indexing files: ${input.glob}`,
  async analyze(input, { cwd }) {
    const files = await searchFiles(cwd, input.glob);

    const unreadable = files.filter(f => f.fileType === 'unreadable').map(f => f.file);
    const unknown = files.filter(f => f.fileType === 'unknown').map(f => f.file);
    const indexable = files.filter(f => f.fileType !== 'unknown' && f.fileType !== 'unreadable').map(f => f.file);

    let analysis = '';
    if (unreadable.length > 0) {
      analysis += `Found ${unreadable.length} unreadable file(s): ${unreadable.join(', ')}\n`;
    }
    if (unknown.length > 0) {
      analysis += `Found ${unknown.length} file(s) of unknown/unsupported format: ${unknown.join(', ')}.\n`;
    }
    analysis += `Found ${indexable.length} indexable file(s).\n`;

    return {
      analysis,
      doable: indexable.length > 0,
    };
  },
  async do(input, { cwd, ai, chatStatus }) {
    const files = await searchFiles(cwd, input.glob);
    const indexableFiles = files.filter(f => f.fileType !== 'unknown' && f.fileType !== 'unreadable');
    const indexingPromises: Promise<any>[] = [];
    const knowledge: KnowledgeEntry[] = [];
    let embeddingModel: string = 'default';

    let filesProcessed = 0;
    let filesEmbedded = 0;

    chatStatus(`Indexing ${indexableFiles.length} files...`);

    await Promise.allSettled(indexableFiles.map(async (file) => {
      const fullPath = path.resolve(cwd, file.file);
    
      const parsed = await processFile(fullPath, file.file, {
        assetPath: await getAssetPath(true),
        sections: true,
        describeImages: input.describeImages ?? false,
        extractImages: input.extractImages ?? false,
        transcribeImages: input.transcribeImages ?? false,
        summarize: input.index === 'summary',
        summarizer: (text) => summarize(ai, paginateText(text)),
        describer: (image) => describe(ai, image),
        transcriber: (image) => transcribe(ai, image),
      });

      filesProcessed++;
      chatStatus(`Parsed/embedded ${filesProcessed}/${filesEmbedded} out of ${indexableFiles.length} files...`);
      
      const getSource = input.index === 'content'
        ? (sectionIndex: number) => `file@${file.file}:chunk[${sectionIndex}]`
        : (_: number) => `file@${file.file}:summary`;
      const chunkables = input.index === 'content' 
        ? parsed.sections 
        : [parsed.description || ''];

      const embedChunks = chunkArray(chunkables.filter(s => s && s.length > 0), CONSTS.EMBED_CHUNK_SIZE);
      indexingPromises.push(...embedChunks.map(async (texts, textIndex) => {
        const offset = textIndex * CONSTS.EMBED_CHUNK_SIZE;
        const { embeddings, model } = await ai.embed.get({ texts });
        embeddings.forEach(({ embedding: vector, index }, i) => {
          knowledge.push({
            source: getSource(index + offset),
            text: texts[index],
            vector: vector,
            created: Date.now()
          });
        });
        embeddingModel = getModel(model).id;

        filesEmbedded++;
        chatStatus(`Parsed/embedded ${filesProcessed}/${filesEmbedded} out of ${indexableFiles.length} files...`);
      }));
    }));

    await Promise.all(indexingPromises);

    const knowledgeFile = new KnowledgeFile();
    await knowledgeFile.load();
    await knowledgeFile.addEntries(embeddingModel, knowledge);
    
    return {
      files: indexableFiles.map(f => f.file),
      knowledge: knowledge.length,
    };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `Index("${op.input.glob}", ${op.input.index})`,
    (op) => {
      if (op.output) {
        return `Indexed ${op.output.files.length} file${op.output.files.length !== 1 ? 's' : ''}, ${op.output.knowledge} knowledge entries`;
      }
      return null;
    }
  , showInput, showOutput),
});

export const file_create = operationOf<
  { path: string; content: string },
  { size: number, lines: number }
>({
  mode: 'create',
  signature: 'file_create(path: string, content: string)',
  status: (input) => `Creating file: ${path.basename(input.path)}`,
  instructions: 'Preserve content formatting (like whitespace) when creating files. Ensure proper line breaks and indentation are maintained.',
  analyze: async (input, { cwd }) => {
    const fullPath = path.resolve(cwd, input.path);
    const exists = await fileIsReadable(fullPath);

    if (exists) {
      return {
        analysis: `This would fail - file "${input.path}" already exists.`,
        doable: false,
      };
    } 

    const size = input.content.length;
    const lines = input.content.split('\n').length;

    return {
      analysis: `This will create file "${input.path}" with ${size} characters (${lines} lines).`,
      doable: true,
    };
  },
  do: async (input, { cwd }) => {
    const fullPath = path.resolve(cwd, input.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, input.content, 'utf-8');

    const lines = input.content.split('\n').length;

    return { size: input.content.length, lines };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `Write("${paginateText(op.input.path, 100, -100)}")`,
    (op) => {
      if (op.output) {
        return `Created file with ${op.output.size} characters, ${op.output.lines} lines`;
      }
      return null;
    }
  , showInput, showOutput),
});

export const file_copy = operationOf<
  { glob: string; target: string },
  { source: string[] }
>({
  mode: 'create',
  signature: 'file_copy(glob: string, target: string)',
  status: (input) => `Copying: ${input.glob} → ${path.basename(input.target)}`,
  analyze: async (input, { cwd }) => {
    const source = await glob(input.glob, { cwd });
    const targetPath = path.resolve(cwd, input.target);
    const sourceReadable = await Promise.all(source.map(s => fileIsReadable(path.resolve(cwd, s))));

    if (source.length === 0) {
      return {
        analysis: `This would fail - no files match pattern "${input.glob}".`,
        doable: false,
      };
    }

    if (sourceReadable.some(r => !r)) {
      return {
        analysis: `This would fail - one or more source files are not readable.`,
        doable: false,
      };
    }

    if (source.length > 1) {
      const { isDirectory } = await fileIsDirectory(targetPath);
      if (!isDirectory) {
        return {
          analysis: `This would fail - target "${input.target}" must be a directory when copying multiple files.`,
          doable: false,
        };
      }
    } else {
      if (await fileExists(targetPath)) {
        return {
          analysis: `This would fail - target "${input.target}" already exists.`,
          doable: false,
        };
      }
    }

    return {
      analysis: source.length === 1
        ? `This will copy the file "${source[0]}" to "${input.target}".`
        :  `This will copy ${source.length} file(s) matching "${input.glob}" to "${input.target}".`,
      doable: true,
    };
  },
  do: async (input, { cwd }) => {
    const source = await glob(input.glob, { cwd });
    const target = path.resolve(cwd, input.target);

    await fs.mkdir(path.dirname(target), { recursive: true });

    await Promise.all(source.map(async (file) => {
      const sourcePath = path.resolve(cwd, file);
      const targetPath = path.join(target, path.basename(file));

      await fs.copyFile(sourcePath, targetPath);
    }));

    return { source };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `Copy("${op.input.glob}", "${op.input.target}")`,
    (op) => {
      if (op.output) {
        const count = op.output.source.length;
        return `Copied ${count} file${count !== 1 ? 's' : ''} to ${path.basename(op.output.target)}`;
      }
      return null;
    }
  , showInput, showOutput),
});

export const file_move = operationOf<
  { glob: string; target: string },
  { count: number; files: string[] }
>({
  mode: 'update',
  signature: 'file_move(glob: string, target: string)',
  status: (input) => `Moving: ${input.glob} → ${path.basename(input.target)}`,
  analyze: async (input, { cwd }) => {
    const files = await glob(input.glob, { cwd });
    const targetPath = path.resolve(cwd, input.target);

    if (files.length === 0) {
      return {
        analysis: `This would fail - no files match pattern "${input.glob}".`,
        doable: false,
      };
    }

    // If moving multiple files, target must be a directory
    if (files.length > 1) {
      try {
        const targetStats = await fs.stat(targetPath);
        if (!targetStats.isDirectory()) {
          return {
            analysis: `This would fail - target "${input.target}" must be a directory when moving multiple files.`,
            doable: false,
          };
        }
      } catch {
        return {
          analysis: `This would fail - target directory "${input.target}" does not exist.`,
          doable: false,
        };
      }
    }

    return {
      analysis: `This will move ${files.length} file(s) matching "${input.glob}" to "${input.target}".`,
      doable: true,
    };
  },
  do: async (input, { cwd, chatStatus }) => {
    const files = await glob(input.glob, { cwd });
    if (files.length === 0) {
      throw new Error(`No files match pattern "${input.glob}".`);
    }

    const targetPath = path.resolve(cwd, input.target);
    const targetDirectory = await fileIsDirectory(targetPath);

    const fileToFile = path.extname(targetPath) == path.extname(files[0]);
    if (fileToFile && files.length > 1) {
      throw new Error(`Target "${input.target}" must be a directory when moving multiple files.`);
    }
    if (files.length > 1 && !targetDirectory.isDirectory) {
      throw new Error(`Target "${input.target}" must be a directory when moving multiple files.`);
    }

    let filesMoved = 0;

    if (fileToFile) {
      const targetPathDirectory = path.dirname(targetPath);
      const targetFullPath = targetDirectory.isDirectory 
        ? path.join(targetPath, path.basename(files[0]))
        : targetPath;

      await fs.mkdir(targetPathDirectory, { recursive: true });
      await fs.rename(path.resolve(cwd, files[0]), targetFullPath);

      filesMoved++;
    } else {
      if (!targetDirectory.isDirectory) {
        await fs.mkdir(targetPath, { recursive: true });
      }

      await Promise.allSettled(files.map(async (file) => {
        const sourcePath = path.resolve(cwd, file);
        const destPath = path.join(targetPath, file);
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.rename(sourcePath, destPath);

        filesMoved++;
        chatStatus(`Moved ${filesMoved}/${files.length} files...`);
      }));
    }

    chatStatus(`Moved ${filesMoved === files.length ? 'all' : filesMoved} files.`);

    return { count: files.length, files };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `Move("${op.input.glob}", "${op.input.target}")`,
    (op) => {
      if (op.output) {
        return `Moved ${op.output.count} file${op.output.count !== 1 ? 's' : ''} to ${path.basename(op.output.target)}`;
      }
      return null;
    }
  , showInput, showOutput),
});

export const file_stats = operationOf<
  { path: string },
  { size: number; created: string; modified: string; accessed: string, type: string, mode: number, lines?: number, characters?: number }
>({
  status: (input) => `Getting stats: ${path.basename(input.path)}`,
  mode: 'local',
  signature: 'file_stats(path: string)',
  analyze: async (input, { cwd }) => {
    const fullPath = path.resolve(cwd, input.path);
    const fileExists = await fileIsReadable(fullPath);

    if (!fileExists) {
      return {
        analysis: `This would fail - path "${input.path}" not found or readable.`,
        doable: false,
      };
    }

    return {
      analysis: `This will get file statistics for "${input.path}".`,
      doable: true,
    };
  },
  do: async (input, { cwd }) => {
    const fullPath = path.resolve(cwd, input.path);
    const stats = await fs.stat(fullPath);

    const contentType = await categorizeFile(fullPath, input.path);
    let lines: number | undefined = undefined;
    let characters: number | undefined = undefined;

    if (contentType === 'text') {
      const file = await fs.readFile(fullPath, 'utf-8');
      characters = file.length;
      lines = file.split('\n').length;
    }
    
    const typeAnalysis = [
      [stats.isDirectory(), 'directory' ],
      [stats.isFile(), contentType ],
      [stats.isBlockDevice(), 'block-device' ],
      [stats.isCharacterDevice(), 'character-device' ],
      [stats.isSymbolicLink(), 'symlink' ],
      [stats.isFIFO(), 'fifo' ],
      [stats.isSocket(), 'socket' ],
    ] as const;

    const type = typeAnalysis.find(([is]) => is)?.[1] || 'unknown'

    return {
      size: stats.size,
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      accessed: stats.atime.toISOString(),
      mode: stats.mode,
      type,
      lines,
      characters
    };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `FileStats("${paginateText(op.input.path, 100, -100)}")`,
    (op) => {
      if (op.output) {
        const sizeKB = (op.output.size / 1024).toFixed(1);
        return `${op.output.type}, ${sizeKB} KB${op.output.lines ? `, ${op.output.lines} lines` : ''}`;
      }
      return null;
    }
  , showInput, showOutput),
});

export const file_delete = operationOf<
  { path: string },
  { deleted: boolean }
>({
  mode: 'delete',
  signature: 'file_delete(path: string)',
  status: (input) => `Deleting: ${path.basename(input.path)}`,
  analyze: async (input, { cwd }) => {
    const fullPath = path.resolve(cwd, input.path);

    const deletable = await fileIsWritable(fullPath);
    if (!deletable) {
      return {
        analysis: `This would fail - "${input.path}" is not a file that can be deleted.`,
        doable: false,
      };
    }
    return {
      analysis: `This will delete the file "${input.path}".`,
      doable: true,
    };
  },
  do: async (input, { cwd }) => {
    const fullPath = path.resolve(cwd, input.path);
    await fs.unlink(fullPath);

    return { deleted: true };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `Delete("${paginateText(op.input.path, 100, -100)}")`,
    (op) => {
      if (op.output) {
        return `Deleted ${path.basename(op.output.path)}`;
      }
      return null;
    }
  , showInput, showOutput),
});

export const file_read = operationOf<
  { path: string, limit?: number, offset?: number, limitOffsetMode?: 'lines' | 'characters', describeImages?: boolean, extractImages?: boolean, transcribeImages?: boolean, showLines?: boolean },
  { content: string; truncated: boolean }
>({
  mode: 'read',
  signature: 'file_read(path: string, limit?: number, offset?: number, limitOffsetMode...)',
  status: (input) => `Reading: ${path.basename(input.path)}`,
  instructions: 'Preserve content formatting (like whitespace) to present it clearly (like at the beginning of the line).',
  analyze: async (input, { cwd }) => {
    const fullPath = path.resolve(cwd, input.path);
    const readable = await fileIsReadable(fullPath);

    if (!readable) {
      return {
        analysis: `This would fail - file "${input.path}" not found or not readable.`,
        doable: false,
      };
    }

    const type = await categorizeFile(fullPath, input.path);
    if (type === 'unknown') {
      return {
        analysis: `This would fail - file "${input.path}" is of an unsupported type for reading.`,
        doable: false,
      };
    }

    const limitOffsetMode = input.limitOffsetMode || 'characters';
    const limit = limitOffsetMode === 'characters'
      ? Math.min(CONSTS.MAX_CHARACTERS, input.limit || CONSTS.MAX_CHARACTERS)
      : Math.min(CONSTS.MAX_LINES, input.limit || CONSTS.MAX_LINES);

    const withLines = input.showLines ? ' with line numbers' : '';

    return {
      analysis: `This will read the ${type} file "${input.path}" (first ${limit.toLocaleString()} ${limitOffsetMode})${withLines}.`,
      doable: true,
    };
  },
  do: async (input, { cwd, ai }) => {
    const fullPath = path.resolve(cwd, input.path);
    const limitOffsetMode = input.limitOffsetMode || 'characters';

    const readable = await fileIsReadable(fullPath);

    if (!readable) {
      throw new Error(`File "${input.path}" not found or not readable.`);
    }

    const type = await categorizeFile(fullPath, input.path);
    if (type === 'unknown') {
      throw new Error(`File "${input.path}" is of an unsupported type for reading.`);
    }

    const processed = await processFile(fullPath, input.path, {
      assetPath: await getAssetPath(true),
      sections: false,
      describeImages: input.describeImages ?? false,
      extractImages: input.extractImages ?? false,
      transcribeImages: input.transcribeImages ?? false,
      summarize: false,
      describer: (image) => describe(ai, image),
      transcriber: (image) => transcribe(ai, image),
    });

    let content = processed.sections.join('\n');

    // Add line numbers if requested
    if (input.showLines && content.length > 0) {
      const lines = content.split('\n');
      const maxLineNumWidth = lines.length.toString().length;
      content = lines
        .map((line, index) => {
          const lineNum = (index + 1).toString().padStart(maxLineNumWidth, ' ');
          return `${lineNum} | ${line}`;
        })
        .join('\n');
    }

    content = paginateText(content, input.limit, input.offset, limitOffsetMode);

    return {
      content: content,
      truncated: content.length === Math.min(CONSTS.MAX_CHARACTERS, input.limitOffsetMode === 'lines' ? CONSTS.MAX_CHARACTERS : input.limit || CONSTS.MAX_CHARACTERS),
    };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `Read("${paginateText(op.input.path, 100, -100)}")`,
    (op) => {
      if (op.output) {
        return `Read ${op.output.content.length} characters${op.output.truncated ? ' (truncated)' : ''}`;
      }
      return null;
    }
  , showInput, showOutput),
});

// Helper function to generate file edit content and diff
async function generateFileEditDiff(
  input: { path: string; request: string; offset?: number; limit?: number },
  fileContent: string,
  ai: CletusAI
): Promise<{ newFileContent: string; diff: string; changed: boolean }> {
  // Paginate the text if offset/limit are provided (lines only)
  const paginatedContent = paginateText(fileContent, input.limit, input.offset, 'lines');

  // Use AI to generate new content based on the request
  const models = ai.config.defaultContext!.config!.getData().user.models;
  const model = models?.edit || models?.chat;

  const response = await ai.chat.get({
    model,
    messages: [
      { 
        role: 'system', 
        content: 'You are a helpful assistant that edits file content. You will receive the current content and a request describing the changes. Respond with ONLY the new content, nothing else - no explanations, no markdown formatting, just the raw edited content.'
      },
      { 
        role: 'user', 
        content: `Current content:\n\`\`\`\n${paginatedContent}\n\`\`\`\n\nRequest: ${input.request}\n\nProvide the edited content:` 
      },
    ],
    maxTokens: Math.max(8000, paginatedContent.length * 2),
  }, {
    metadata: {
      minContextWindow: (paginatedContent.length / 4) + (input.request.length / 4) + 2000,
    }
  });

  const newPaginatedContent = response.content;

  // Apply the changes to the full file content by replacing the paginated section
  const paginatedIndex = fileContent.indexOf(paginatedContent);
  const newFileContent = fileContent.slice(0, paginatedIndex) + newPaginatedContent + fileContent.slice(paginatedIndex + paginatedContent.length);

  // Generate unified diff to show what will be changed
  const diff = Diff.createPatch(
    input.path,
    fileContent,
    newFileContent,
    'before',
    'after'
  );

  return {
    newFileContent,
    diff,
    changed: fileContent !== newFileContent,
  };
}

export const file_edit = operationOf<
  { path: string; request: string; offset?: number; limit?: number },
  { diff: string; changed: boolean }
>({
  mode: 'update',
  signature: 'file_edit(path: string, request: string, offset?: number, limit?: number)',
  status: (input) => `Editing: ${paginateText(input.path, 100, -100)}`,
  instructions: 'Preserve existing content formatting and structure. Maintain whitespace, indentation, and line breaks that are part of the original file unless explicitly requested to change them.',
  analyze: async (input, { cwd, ai }) => {
    const fullPath = path.resolve(cwd, input.path);
    const readable = await fileIsReadable(fullPath);

    if (!readable) {
      return {
        analysis: `This would fail - file "${input.path}" not found or not readable.`,
        doable: false,
      };
    }

    const writable = await fileIsWritable(fullPath);
    if (!writable) {
      return {
        analysis: `This would fail - file "${input.path}" is not writable.`,
        doable: false,
      };
    }

    const type = await categorizeFile(fullPath, input.path);
    if (type !== 'text') {
      return {
        analysis: `This would fail - file "${input.path}" is not a text file (type: ${type}).`,
        doable: false,
      };
    }

    // Read the file content and generate diff in analyze phase
    const fileContent = await fs.readFile(fullPath, 'utf-8');
    const { diff } = await generateFileEditDiff(input, fileContent, ai);

    return {
      analysis: diff,
      doable: true,
    };
  },
  do: async (input, { cwd, ai }) => {
    const fullPath = path.resolve(cwd, input.path);

    // Read the file content
    const fileContent = await fs.readFile(fullPath, 'utf-8');
    
    // Generate new content and diff
    const { newFileContent, diff, changed } = await generateFileEditDiff(input, fileContent, ai);

    // Write the new content back to the file
    await fs.writeFile(fullPath, newFileContent, 'utf-8');

    return {
      diff,
      changed,
    };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `Edit("${paginateText(op.input.path, 100, -100)}")`,
    (op) => {
      if (op.output) {
        if (!op.output.changed) {
          return 'No changes made';
        } else {
          return `Applied changes`;
        }
      }
      return null;
    }
  ),
});

export const text_search = operationOf<
  { glob: string; regex: string; surrounding?: number, transcribeImages?: boolean, caseInsensitive?: boolean, output?: 'file-count' | 'files' | 'match-count' | 'matches', offset?: number, limit?: number },
  { searched?: number, fileCount?: number; files?: Array<{ file: string; matches: number }>, matchCount?: number, matches?: Array<{ file: string, matches: string[] }> }
>({
  mode: (input) => input.transcribeImages ? 'read' : 'local',
  signature: 'text_search(glob: string, regex: string, surrounding?: number, ...)',
  status: (input) => `Searching text: ${abbreviate(input.regex, 35)}`,
  analyze: async (input, { cwd }) => {
    const surrounding = input.surrounding || 0;
    const files = await searchFiles(cwd, input.glob);

    if (files.length === 0) {
      return {
        analysis: `This would search 0 files matching "${input.glob}" - no files match the pattern.`,
        doable: true,
      };
    }

    const supported = files.filter(f => f.fileType !== 'unreadable' && f.fileType !== 'unknown');
    if (supported.length === 0) {
      return {
        analysis: `This would search 0 files matching "${input.glob}" - no readable files of supported types found.`,
        doable: true,
      }
    }

    // TODO update analysis to reflect case insensitivity, limit, & offset

    return {
      analysis: `This will search ${supported.length} file(s)${files.length !== supported.length ? ` (of ${files.length} total files)` : ``} for ${input.output || 'matches'} matching "${input.glob}" for pattern "${input.regex}" with ${surrounding} surrounding lines.`,
      doable: true,
    };
  },
  do: async (input, { cwd, ai, chatStatus }) => {
    const files = await searchFiles(cwd, input.glob);
    const readable = files.filter(f => f.fileType !== 'unreadable' && f.fileType !== 'unknown');

    if (readable.length === 0) {
      return { searched: 0 };
    }

    readable.sort((a, b) => a.file.localeCompare(b.file));

    const output = input.output || 'matches';
    const limit = input.limit || 0;
    const offset = input.offset || 0;
    const pattern = new RegExp(input.regex, input.caseInsensitive !== false ? 'gi' : 'g');
    const surrounding = input.surrounding || 0;

    let filesProcessed = 0;
    chatStatus(`Searching ${readable.length} files...`);

    const results = await Promise.allSettled(readable.map(async (file) => {
      const fullPath = path.resolve(cwd, file.file);
      const processed = await processFile(fullPath, file.file, {
        assetPath: await getAssetPath(true),
        sections: false,
        describeImages: false,
        extractImages: false,
        summarize: false,
        transcribeImages: input.transcribeImages ?? false,
        transcriber: (image) => transcribe(ai, image),
      });

      filesProcessed++;
      chatStatus(`Searched ${filesProcessed}/${readable.length} files...`);

      type Section = {
        start: number;
        end: number;
        lines: Map<number, number>;
      }

      const content = processed.sections.join('\n');
      const lines = content.split('\n');
      const sections: Section[] = [];

      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          const start = Math.max(0, i - surrounding);
          const end = Math.min(lines.length, i + surrounding + 1);
          sections.push({ start, end, lines: new Map<number, number>([[i, 1]]) });

          if (output === 'file-count') {
            break;
          }
        }
      }

      if (output !== 'matches') {
        return {
          file: file.file,
          matchCount: sections.length,
          matches: [],
        };
      }

      const joinedSections: Section[] = [];
      let currentSection: Section | null = null;
      for(const section of sections) {
        if (currentSection === null || section.start >= currentSection.end) {
          currentSection = section;
          joinedSections.push(currentSection);
        } else {
          currentSection.end = section.end;
          for (const [line, count] of section.lines) {
            currentSection.lines.set(line, (currentSection.lines.get(line) || 0) + count);
          }
        }
      }

      return {
        file: file.file,
        matchCount: sections.length,
        matches: joinedSections.map(sec => {
          const lineCountSpaces = (sec.end + 1).toString().length;
          const sectionLines = lines.slice(sec.start, sec.end);

          const formattedLines = sectionLines.map((line, i) => {
            const hasMatches = sec.lines.has(i + sec.start);
            const lineNumber = (i + sec.start + 1).toString().padStart(lineCountSpaces, ' ');
            const matchIndicator = hasMatches ? '→' : ' ';
            const formattedLine = `${matchIndicator} ${lineNumber} | ${line}`;

            if (!hasMatches) {
              return formattedLine;
            }

            // Reset regex lastIndex for global flags
            pattern.lastIndex = 0;
            let match: RegExpExecArray | null;
            let matchLine = '';
            while ((match = pattern.exec(line)) !== null) {
              matchLine += ' '.repeat(match.index - matchLine.length) + '^'.repeat(match[0].length);
              if (!pattern.global) break;
            }
            if (matchLine === '') {
              return formattedLine;
            }

            const formattedMatchLine = ' '.repeat(lineCountSpaces + 5) + matchLine;

            return formattedLine + '\n' + formattedMatchLine;
          });

          return formattedLines.join('\n');
        }),
      };
    }));

    const successful = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    const withMatches = successful.filter(r => r.matchCount > 0);

    chatStatus(`Searched ${successful.length === results.length ? 'all' : `${successful.length}/${results.length}`} files, ${withMatches} files with matches.`);

    switch (output) {
      case 'file-count':
        return { searched: results.length, fileCount: withMatches.length };
      case 'files':
        return { searched: results.length, files: withMatches.map(r => ({ file: r.file, matches: r.matchCount })) };
      case 'match-count':
        return { searched: results.length, matchCount: withMatches.reduce((acc, r) => acc + r.matchCount, 0) };
      case 'matches':
      default:
        const pagedResults = limit > 0 ? withMatches.slice(offset, offset + limit) : withMatches.slice(offset);
        return { searched: results.length, matches: pagedResults.map(r => ({ file: r.file, matches: r.matches })) };
    }
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `Search("${abbreviate(op.input.regex, 20)}", "${op.input.glob}")`,
    (op) => {
      if (op.output) {
        const output = op.output;
        if (output.fileCount !== undefined) {
          return `Found ${output.fileCount} file${output.fileCount !== 1 ? 's' : ''} (searched ${output.searched})`;
        } else if (output.matchCount !== undefined) {
          return `Found ${output.matchCount} match${output.matchCount !== 1 ? 'es' : ''} (searched ${output.searched} files)`;
        } else if (output.matches) {
          return `Found matches in ${output.matches.length} file${output.matches.length !== 1 ? 's' : ''}`;
        } else {
          return `Searched ${output.searched} files`;
        }
      }
      return null;
    }
  ),
});

export const dir_create = operationOf<
  { path: string },
  { created: boolean }
>({
  mode: 'create',
  signature: 'dir_create(path: string)',
  status: (input) => `Creating directory: ${path.basename(input.path)}`,
  analyze: async (input, { cwd }) => {
    const fullPath = path.resolve(cwd, input.path);
    const { exists, isDirectory } = await fileIsDirectory(fullPath);

    if (exists && !isDirectory) {
      return {
        analysis: `This would fail - "${input.path}" exists but is not a directory.`,
        doable: false,
      };
    }
    if (exists && isDirectory) {
      return {
        analysis: `This would fail - directory "${input.path}" already exists.`,
        doable: false,
      };
    }

    return {
      analysis: `This will create directory "${input.path}".`,
      doable: true,
    };
  },
  do: async (input, { cwd }) => {
    const fullPath = path.resolve(cwd, input.path);
    await fs.mkdir(fullPath, { recursive: true });

    return { created: true };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `Dir("${paginateText(op.input.path, 100, -100)}")`,
    (op) => {
      if (op.output) {
        return `Created directory ${op.output.path}`;
      }
      return null;
    }
  , showInput, showOutput),
});

export const file_attach = operationOf<
  { filePath: string },
  { attached: boolean }
>({
  mode: 'create',
  signature: 'file_attach(filePath: string)',
  status: (input) => `Attaching file: ${path.basename(input.filePath)}`,
  analyze: async (input, { cwd }) => {
    const { filePath } = input;
    const fullPath = path.resolve(cwd, filePath);

    // Check if file exists and is readable
    const readable = await fileIsReadable(fullPath);
    if (!readable) {
      return {
        analysis: `This would fail - file "${filePath}" not found or not readable.`,
        doable: false,
      };
    }

    // Check file type - only allow text, audio, or PDF
    const fileType = await categorizeFile(fullPath, filePath);
    const allowedTypes = ['text', 'pdf'];
    
    // Check for audio files by extension
    const ext = path.extname(filePath).toLowerCase();
    const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma'];
    const isAudio = audioExts.includes(ext);

    if (!allowedTypes.includes(fileType) && !isAudio) {
      return {
        analysis: `This would fail - file type "${fileType}" is not allowed. Only text, audio, and PDF files can be attached.`,
        doable: false,
      };
    }

    return {
      analysis: `This will attach the ${isAudio ? 'audio' : fileType} file at "${filePath}" to the chat as a user message.`,
      doable: true,
    };
  },
  do: async (input, { cwd, chatMessage }) => {
    const { filePath } = input;
    const fullPath = path.resolve(cwd, filePath);
    const fileLink = linkFile(fullPath, path.basename(filePath));

    // Determine the content type
    const fileType = await categorizeFile(fullPath, filePath);
    const ext = path.extname(filePath).toLowerCase();
    const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma'];
    const isAudio = audioExts.includes(ext);

    // Add file to the chat message
    if (chatMessage) {
      if (isAudio) {
        chatMessage.content.push({ type: 'audio', content: fileLink });
      } else {
        chatMessage.content.push({ type: 'file', content: fileLink });
      }
    }

    return { attached: true };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `FileAttach("${path.basename(op.input.filePath)}")`,
    (op) => {
      if (op.output?.attached) {
        return `Attached file: ${path.basename(op.input.filePath)}`;
      }
      return null;
    }
  , showInput, showOutput),
});
