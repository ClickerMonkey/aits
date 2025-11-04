import { CletusCoreContext } from "../ai";
import { operationOf } from "./types";
import { globSync } from 'glob';
import fs from 'fs/promises';
import path from 'path';

export const file_search = operationOf<
  { glob: string; limit?: number },
  { glob: string; count: number; files: string[] }
>({
  mode: 'read',
  analyze: async (input, { cwd }) => {
    const limit = input.limit || 40;
    return `This will search for files matching pattern "${input.glob}" (max ${limit} results) in ${cwd}.`;
  },
  do: async (input, { cwd }) => {
    const limit = input.limit || 40;
    const files = globSync(input.glob, { cwd }).slice(0, limit);
    return { glob: input.glob, count: files.length, files };
  },
});

export const file_summary = operationOf<
  { path: string },
  { path: string; size: number; truncated: boolean; summary: string; content: string }
>({
  mode: 'read',
  analyze: async (input, { cwd }) => {
    return `This will read and summarize the file at "${input.path}" (first 64,000 characters).`;
  },
  do: async (input, { cwd }) => {
    const fullPath = path.resolve(cwd, input.path);
    const content = await fs.readFile(fullPath, 'utf-8');
    const truncated = content.slice(0, 64000);

    // TODO: Generate AI summary
    return {
      path: input.path,
      size: content.length,
      truncated: truncated.length < content.length,
      summary: '[AI summary would be generated here]',
      content: truncated,
    };
  },
});

export const file_index = operationOf<
  { path: string },
  { path: string; chunks: number }
>({
  mode: (input, { chat }) => {
    // If mode is 'create' or higher, this will generate embeddings
    // Otherwise it just reports what would be created
    return chat?.mode && ['create', 'update', 'delete'].includes(chat.mode) ? 'create' : 'read';
  },
  analyze: async (input, { cwd }) => {
    const fullPath = path.resolve(cwd, input.path);
    const content = await fs.readFile(fullPath, 'utf-8');
    const chunkSize = 2000;
    const chunks = Math.ceil(content.length / chunkSize);

    return `This will index the file "${input.path}" into ${chunks} knowledge chunks (each ~2000 characters).`;
  },
  do: async (input, { cwd, chat }) => {
    const fullPath = path.resolve(cwd, input.path);
    const content = await fs.readFile(fullPath, 'utf-8');

    // TODO: Chunk and embed
    const chunkSize = 2000;
    const chunks = Math.ceil(content.length / chunkSize);

    return { path: input.path, chunks };
  },
});

export const file_create = operationOf<
  { path: string; content: string },
  { path: string; size: number }
>({
  mode: 'create',
  analyze: async (input, { cwd }) => {
    const size = input.content.length;
    const lines = input.content.split('\n').length;
    return `This will create file "${input.path}" with ${size} characters (${lines} lines).`;
  },
  do: async (input, { cwd }) => {
    const fullPath = path.resolve(cwd, input.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, input.content, 'utf-8');
    return { path: input.path, size: input.content.length };
  },
});

export const file_copy = operationOf<
  { path: string; target: string },
  { source: string; target: string }
>({
  mode: 'create',
  analyze: async (input, { cwd }) => {
    return `This will copy "${input.path}" to "${input.target}".`;
  },
  do: async (input, { cwd }) => {
    const sourcePath = path.resolve(cwd, input.path);
    const targetPath = path.resolve(cwd, input.target);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    return { source: input.path, target: input.target };
  },
});

export const file_move = operationOf<
  { glob: string; target: string },
  { count: number; target: string; files: string[] }
>({
  mode: 'update',
  analyze: async (input, { cwd }) => {
    const files = globSync(input.glob, { cwd });
    return `This will move ${files.length} file(s) matching "${input.glob}" to "${input.target}".`;
  },
  do: async (input, { cwd }) => {
    const files = globSync(input.glob, { cwd });
    const targetPath = path.resolve(cwd, input.target);

    for (const file of files) {
      const sourcePath = path.resolve(cwd, file);
      const destPath = path.join(targetPath, path.basename(file));
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.rename(sourcePath, destPath);
    }

    return { count: files.length, target: input.target, files };
  },
});

export const file_stats = operationOf<
  { path: string },
  { path: string; size: number; created: number; modified: number; isDirectory: boolean }
>({
  mode: 'read',
  analyze: async (input, { cwd }) => {
    return `This will get file statistics for "${input.path}".`;
  },
  do: async (input, { cwd }) => {
    const fullPath = path.resolve(cwd, input.path);
    const stats = await fs.stat(fullPath);
    return {
      path: input.path,
      size: stats.size,
      created: stats.birthtime.getTime(),
      modified: stats.mtime.getTime(),
      isDirectory: stats.isDirectory(),
    };
  },
});

export const file_delete = operationOf<
  { path: string },
  { path: string; deleted: boolean }
>({
  mode: 'delete',
  analyze: async (input, { cwd }) => {
    return `This will delete the file "${input.path}".`;
  },
  do: async (input, { cwd }) => {
    const fullPath = path.resolve(cwd, input.path);
    await fs.unlink(fullPath);
    return { path: input.path, deleted: true };
  },
});

export const file_read = operationOf<
  { path: string },
  { path: string; content: string; truncated: boolean }
>({
  mode: 'read',
  analyze: async (input, { cwd }) => {
    return `This will read the file "${input.path}" (first 64,000 characters).`;
  },
  do: async (input, { cwd }) => {
    const fullPath = path.resolve(cwd, input.path);
    const content = await fs.readFile(fullPath, 'utf-8');
    const truncated = content.slice(0, 64000);
    return {
      path: input.path,
      content: truncated,
      truncated: truncated.length < content.length,
    };
  },
});

export const text_search = operationOf<
  { glob: string; regex: string; surrounding?: number },
  { pattern: string; count: number; results: any[] }
>({
  mode: 'read',
  analyze: async (input, { cwd }) => {
    const surrounding = input.surrounding || 0;
    return `This will search files matching "${input.glob}" for pattern "${input.regex}" with ${surrounding} surrounding lines.`;
  },
  do: async (input, { cwd }) => {
    const files = globSync(input.glob, { cwd });
    const pattern = new RegExp(input.regex, 'g');
    const surrounding = input.surrounding || 0;
    const results: any[] = [];

    for (const file of files) {
      const fullPath = path.resolve(cwd, file);
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          const start = Math.max(0, i - surrounding);
          const end = Math.min(lines.length, i + surrounding + 1);
          results.push({
            file,
            line: i + 1,
            match: lines[i],
            context: lines.slice(start, end),
          });
        }
      }
    }

    return { pattern: input.regex, count: results.length, results };
  },
});

export const dir_create = operationOf<
  { path: string },
  { path: string; created: boolean }
>({
  mode: 'create',
  analyze: async (input, { cwd }) => {
    return `This will create directory "${input.path}".`;
  },
  do: async (input, { cwd }) => {
    const fullPath = path.resolve(cwd, input.path);
    await fs.mkdir(fullPath, { recursive: true });
    return { path: input.path, created: true };
  },
});
