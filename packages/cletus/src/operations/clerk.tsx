import { getModel } from "@aits/core";
import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import { describe, summarize, transcribe } from "../ai";
import { abbreviate, chunkArray } from "../common";
import { getAssetPath } from "../file-manager";
import { KnowledgeFile } from "../knowledge";
import { KnowledgeEntry } from "../schemas";
import { categorizeFile, fileExists, fileIsDirectory, fileIsReadable, fileIsWritable, FileType, processFile } from "./file-helper";
import { renderOperation } from "./render-helpers";
import { operationOf } from "./types";


export async function searchFiles(cwd: string, pattern: string) {
  const filePaths = await glob(pattern, { cwd, nocase: true });
  const files = await Promise.all(filePaths.map(async (file) => ({
    file,
    fileType: await categorizeFile(path.join(cwd, file)).catch(() => 'unreadable') as FileType | 'unreadable',
  })));

  return files;
}

const EMBED_CHUNK_SIZE = 1000;


export const file_search = operationOf<
  { glob: string; limit?: number, offset?: number },
  { glob: string; count: number; files: string[] }
>({
  mode: 'local',
  status: (input) => `Searching files: ${input.glob}`,
  async analyze(input, { cwd }) { return { analysis: `N/A`, doable: true }; },
  async do(input, { cwd }) {
    const limit = input.limit || 50;
    const offset = input.offset || 0;
    const files = await glob(input.glob, { cwd });

    files.sort();

    return { glob: input.glob, count: files.length, files: files.slice(offset, limit) };
  },
  render: (op) => renderOperation(
    op,
    `Files("${op.input.glob}")`,
    (op) => {
      if (op.output) {
        return `Found ${op.output.count} file${op.output.count !== 1 ? 's' : ''}`;
      }
      return null;
    }
  ),
});

export const file_summary = operationOf<
  { path: string, characterLimit?: number, describeImages?: boolean, extractImages?: boolean, transcribeImages?: boolean },
  { path: string; size: number; truncated: boolean; summary: string; }
>({
  mode: 'read',
  status: (input) => `Summarizing: ${path.basename(input.path)}`,
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

    return {
      analysis: `This will read and summarize the ${fileType} file at "${input.path}" (first 64,000 characters).`,
      doable: true,
    };
  },
  do: async (input, { cwd, ai, config }) => {
    const fullPath = path.resolve(cwd, input.path);
    const characters = Math.min(input.characterLimit || 64_000, 64_000);

    const summarized = await processFile(fullPath, input.path, {
      assetPath: await getAssetPath(true),
      sections: false,
      describeImages: input.describeImages ?? false,
      extractImages: input.extractImages ?? false,
      transcribeImages: input.transcribeImages ?? false,
      summarize: true,
      summarizer: (text) => summarize(ai, text.substring(0, characters)),
      describer: (image) => describe(ai, image),
      transcriber: (image) => transcribe(ai, image),
    });

    const size = summarized.sections.reduce((acc, sec) => acc + (sec?.length || 0), 0);

    return {
      path: input.path,
      size,
      truncated: size > characters,
      summary: summarized.description!,
    };
  },
  render: (op) => renderOperation(
    op,
    `Summarize("${path.basename(op.input.path)}")`,
    (op) => {
      if (op.output) {
        return abbreviate(op.output.summary, 60);
      }
      return null;
    }
  ),
});

export const file_index = operationOf<
  { glob: string, index: 'content' | 'summary', describeImages?: boolean, extractImages?: boolean, transcribeImages?: boolean },
  { glob: string; files: string[], knowledge: number }
>({
  mode: 'create',
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

    // TODO chatStatus with progress that increases as files are processed and embeddings

    await Promise.allSettled(indexableFiles.map(async (file) => {
      const fullPath = path.resolve(cwd, file.file);
    
      const parsed = await processFile(fullPath, file.file, {
        assetPath: await getAssetPath(true),
        sections: true,
        describeImages: input.describeImages ?? false,
        extractImages: input.extractImages ?? false,
        transcribeImages: input.transcribeImages ?? false,
        summarize: input.index === 'summary',
        summarizer: (text) => summarize(ai, text),
        describer: (image) => describe(ai, image),
        transcriber: (image) => transcribe(ai, image),
      });
      
      const getSource = input.index === 'content'
        ? (sectionIndex: number) => `file@${file.file}:chunk[${sectionIndex}]`
        : (_: number) => `file@${file.file}:summary`;
      const chunkables = input.index === 'content' 
        ? parsed.sections 
        : [parsed.description || ''];

      const embedChunks = chunkArray(chunkables.filter(s => s && s.length > 0), EMBED_CHUNK_SIZE);
      indexingPromises.push(...embedChunks.map(async (texts, textIndex) => {
        const offset = textIndex * EMBED_CHUNK_SIZE;
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
      }));
    }));

    await Promise.all(indexingPromises);

    const knowledgeFile = new KnowledgeFile();
    await knowledgeFile.addEntries(embeddingModel, knowledge);
    
    return {
      glob: input.glob,
      files: indexableFiles.map(f => f.file),
      knowledge: indexingPromises.length,
    };
  },
  render: (op) => renderOperation(
    op,
    `Index("${op.input.glob}", ${op.input.index})`,
    (op) => {
      if (op.output) {
        return `Indexed ${op.output.files.length} file${op.output.files.length !== 1 ? 's' : ''}, ${op.output.knowledge} knowledge entries`;
      }
      return null;
    }
  ),
});

export const file_create = operationOf<
  { path: string; content: string },
  { path: string; size: number, lines: number }
>({
  mode: 'create',
  status: (input) => `Creating file: ${path.basename(input.path)}`,
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

    return { path: input.path, size: input.content.length, lines };
  },
  render: (op) => renderOperation(
    op,
    `Write("${path.basename(op.input.path)}")`,
    (op) => {
      if (op.output) {
        return `Created file with ${op.output.size} characters, ${op.output.lines} lines`;
      }
      return null;
    }
  ),
});

export const file_copy = operationOf<
  { glob: string; target: string },
  { source: string[]; target: string }
>({
  mode: 'create',
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

    return { source: source, target: input.target };
  },
  render: (op) => renderOperation(
    op,
    `Copy("${op.input.glob}", "${path.basename(op.input.target)}")`,
    (op) => {
      if (op.output) {
        const count = op.output.source.length;
        return `Copied ${count} file${count !== 1 ? 's' : ''} to ${path.basename(op.output.target)}`;
      }
      return null;
    }
  ),
});

export const file_move = operationOf<
  { glob: string; target: string },
  { count: number; target: string; files: string[] }
>({
  mode: 'update',
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
  do: async (input, { cwd }) => {
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

    // TODO chatStatus with progress that increases as files are moved

    if (fileToFile) {
      const targetPathDirectory = path.dirname(targetPath);
      const targetFullPath = targetDirectory.isDirectory 
        ? path.join(targetPath, path.basename(files[0]))
        : targetPath;

      await fs.mkdir(targetPathDirectory, { recursive: true });
      await fs.rename(path.resolve(cwd, files[0]), targetFullPath);
    } else {
      if (!targetDirectory.isDirectory) {
        await fs.mkdir(targetPath, { recursive: true });
      }

      await Promise.all(files.map(async (file) => {
        const sourcePath = path.resolve(cwd, file);
        const destPath = path.join(targetPath, file);
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.rename(sourcePath, destPath);
      }));
    }

    return { count: files.length, target: input.target, files };
  },
  render: (op) => renderOperation(
    op,
    `Move("${op.input.glob}", "${path.basename(op.input.target)}")`,
    (op) => {
      if (op.output) {
        return `Moved ${op.output.count} file${op.output.count !== 1 ? 's' : ''} to ${path.basename(op.output.target)}`;
      }
      return null;
    }
  ),
});

export const file_stats = operationOf<
  { path: string },
  { path: string; size: number; created: string; modified: string; isDirectory: boolean, type: string, lines?: number, characters?: number }
>({
  status: (input) => `Getting stats: ${path.basename(input.path)}`,
  mode: 'local',
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

    const type = await categorizeFile(fullPath, input.path);
    let lines: number | undefined = undefined;
    let characters: number | undefined = undefined;

    if (type === 'text') {
      const file = await fs.readFile(fullPath, 'utf-8');
      characters = file.length;
      lines = file.split('\n').length;
    }

    return {
      path: input.path,
      size: stats.size,
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      isDirectory: stats.isDirectory(),
      type,
      lines,
      characters
    };
  },
  render: (op) => renderOperation(
    op,
    `FileStats("${path.basename(op.input.path)}")`,
    (op) => {
      if (op.output) {
        const sizeKB = (op.output.size / 1024).toFixed(1);
        return `${op.output.type}, ${sizeKB} KB${op.output.lines ? `, ${op.output.lines} lines` : ''}`;
      }
      return null;
    }
  ),
});

export const file_delete = operationOf<
  { path: string },
  { path: string; deleted: boolean }
>({
  mode: 'delete',
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

    return { path: input.path, deleted: true };
  },
  render: (op) => renderOperation(
    op,
    `Delete("${path.basename(op.input.path)}")`,
    (op) => {
      if (op.output) {
        return `Deleted ${path.basename(op.output.path)}`;
      }
      return null;
    }
  ),
});

export const file_read = operationOf<
  { path: string, characterLimit?: number, describeImages?: boolean, extractImages?: boolean, transcribeImages?: boolean },
  { path: string; content: string; truncated: boolean }
>({
  mode: 'read',
  status: (input) => `Reading: ${path.basename(input.path)}`,
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

    const characters = Math.min(input.characterLimit || 64_000, 64_000);

    return {
      analysis: `This will read the ${type} file "${input.path}" (first ${characters.toLocaleString()} characters).`,
      doable: true,
    };
  },
  do: async (input, { cwd, ai }) => {
    const fullPath = path.resolve(cwd, input.path);
    const characters = Math.min(input.characterLimit || 64_000, 64_000);

    const processed = await processFile(fullPath, input.path, {
      assetPath: await getAssetPath(true),
      sections: false,
      describeImages: input.describeImages ?? false,
      extractImages: input.extractImages ?? false,
      transcribeImages: input.transcribeImages ?? false,
      summarize: true,
      summarizer: (text) => summarize(ai, text.substring(0, characters)),
      describer: (image) => describe(ai, image),
      transcriber: (image) => transcribe(ai, image),
    });

    const content = processed.sections.join('\n');

    return {
      path: input.path,
      content: content.substring(0, characters),
      truncated: content.length > characters,
    };
  },
  render: (op) => renderOperation(
    op,
    `Read("${path.basename(op.input.path)}")`,
    (op) => {
      if (op.output) {
        return `Read ${op.output.content.length} characters${op.output.truncated ? ' (truncated)' : ''}`;
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
  do: async (input, { cwd, ai }) => {
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

    // TODO chatStatus with progress that increases as files are processed

    const results = await Promise.all(readable.map(async (file) => {
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

    const withMatches = results.filter(r => r.matchCount > 0);

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
  render: (op) => renderOperation(
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
  { path: string; created: boolean }
>({
  mode: 'create',
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
    return { path: input.path, created: true };
  },
  render: (op) => renderOperation(
    op,
    `Dir("${path.basename(op.input.path)}")`,
    (op) => {
      if (op.output) {
        return `Created directory ${path.basename(op.output.path)}`;
      }
      return null;
    }
  ),
});
