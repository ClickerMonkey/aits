import { registerOperationHandler } from '../operations.js';
import { ConfigFile } from '../config.js';
import { ChatFile } from '../chat.js';
import { KnowledgeFile } from '../knowledge.js';
import { DataManager } from '../data.js';
import { globSync } from 'glob';
import fs from 'fs/promises';
import path from 'path';
import type { TodoItem } from '../schemas.js';

/**
 * Register all operation handlers
 * These execute the actual operations based on their type
 */
export function registerAllOperationHandlers(chatId: string) {
  const config = new ConfigFile();
  const chatFile = new ChatFile(chatId);

  // ============================================================================
  // Planner Handlers
  // ============================================================================

  registerOperationHandler('todos_clear', async (input, signal) => {
    await config.load();
    const chat = config.getChats().find((c) => c.id === chatId);
    if (chat) {
      await config.updateChat(chatId, { todos: [] });
    }
    return { cleared: true };
  });

  registerOperationHandler('todos_list', async (input, signal) => {
    await config.load();
    const chat = config.getChats().find((c) => c.id === chatId);
    return { todos: chat?.todos || [] };
  });

  registerOperationHandler('todos_add', async (input: { id: string; name: string; done: boolean }, signal) => {
    await config.load();
    const chat = config.getChats().find((c) => c.id === chatId);
    if (chat) {
      const newTodos = [...chat.todos, { id: input.id, name: input.name, done: input.done }];
      await config.updateChat(chatId, { todos: newTodos });
    }
    return { id: input.id, name: input.name };
  });

  registerOperationHandler('todos_done', async (input: { id: string }, signal) => {
    await config.load();
    const chat = config.getChats().find((c) => c.id === chatId);
    if (chat) {
      const newTodos = chat.todos.map((t) => (t.id === input.id ? { ...t, done: true } : t));
      await config.updateChat(chatId, { todos: newTodos });
    }
    return { id: input.id, done: true };
  });

  registerOperationHandler('todos_get', async (input: { id: string }, signal) => {
    await config.load();
    const chat = config.getChats().find((c) => c.id === chatId);
    const todo = chat?.todos.find((t) => t.id === input.id);
    return { todo: todo || null };
  });

  registerOperationHandler('todos_remove', async (input: { id: string }, signal) => {
    await config.load();
    const chat = config.getChats().find((c) => c.id === chatId);
    if (chat) {
      const newTodos = chat.todos.filter((t) => t.id !== input.id);
      await config.updateChat(chatId, { todos: newTodos });
    }
    return { id: input.id, removed: true };
  });

  registerOperationHandler('todos_replace', async (input: { todos: TodoItem[] }, signal) => {
    await config.load();
    const chat = config.getChats().find((c) => c.id === chatId);
    if (chat) {
      await config.updateChat(chatId, { todos: input.todos });
    }
    return { count: input.todos.length };
  });

  // ============================================================================
  // Librarian Handlers
  // ============================================================================

  registerOperationHandler('knowledge_search', async (input: { query: string; limit: number; sourcePrefix?: string }, signal) => {
    const knowledge = new KnowledgeFile();
    await knowledge.load();

    // TODO: Generate embedding for query and search
    // For now return structure
    return {
      query: input.query,
      results: [],
    };
  });

  registerOperationHandler('knowledge_sources', async (input, signal) => {
    const knowledge = new KnowledgeFile();
    await knowledge.load();

    const sources = new Set<string>();
    const data = knowledge.getData();

    for (const entries of Object.values(data.knowledge)) {
      for (const entry of entries) {
        const prefix = entry.source.split(':')[0];
        sources.add(prefix);
      }
    }

    return { sources: Array.from(sources) };
  });

  registerOperationHandler('knowledge_add', async (input: { text: string; source: string }, signal) => {
    const knowledge = new KnowledgeFile();
    await knowledge.load();

    // TODO: Generate embedding
    // For now just structure
    return { source: input.source, added: true };
  });

  registerOperationHandler('knowledge_delete', async (input: { sourcePrefix: string }, signal) => {
    const knowledge = new KnowledgeFile();
    await knowledge.load();

    const sources = Object.keys(knowledge.getData().knowledge).filter((s) =>
      s.startsWith(input.sourcePrefix)
    );

    for (const source of sources) {
      await knowledge.deleteBySource(source);
    }

    return { sourcePrefix: input.sourcePrefix, deletedCount: sources.length };
  });

  // ============================================================================
  // Clerk Handlers
  // ============================================================================

  registerOperationHandler('file_search', async (input: { glob: string; limit: number }, signal) => {
    const files = globSync(input.glob, { cwd: process.cwd() }).slice(0, input.limit);
    return { glob: input.glob, count: files.length, files };
  });

  registerOperationHandler('file_summary', async (input: { path: string }, signal) => {
    const fullPath = path.resolve(process.cwd(), input.path);
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
  });

  registerOperationHandler('file_index', async (input: { path: string }, signal) => {
    const fullPath = path.resolve(process.cwd(), input.path);
    const content = await fs.readFile(fullPath, 'utf-8');

    // TODO: Chunk and embed
    const chunkSize = 2000;
    const chunks = Math.ceil(content.length / chunkSize);

    return { path: input.path, chunks };
  });

  registerOperationHandler('file_create', async (input: { path: string; content: string }, signal) => {
    const fullPath = path.resolve(process.cwd(), input.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, input.content, 'utf-8');
    return { path: input.path, size: input.content.length };
  });

  registerOperationHandler('file_copy', async (input: { path: string; target: string }, signal) => {
    const sourcePath = path.resolve(process.cwd(), input.path);
    const targetPath = path.resolve(process.cwd(), input.target);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    return { source: input.path, target: input.target };
  });

  registerOperationHandler('file_move', async (input: { glob: string; target: string }, signal) => {
    const files = globSync(input.glob, { cwd: process.cwd() });
    const targetPath = path.resolve(process.cwd(), input.target);

    for (const file of files) {
      const sourcePath = path.resolve(process.cwd(), file);
      const destPath = path.join(targetPath, path.basename(file));
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.rename(sourcePath, destPath);
    }

    return { count: files.length, target: input.target };
  });

  registerOperationHandler('file_stats', async (input: { path: string }, signal) => {
    const fullPath = path.resolve(process.cwd(), input.path);
    const stats = await fs.stat(fullPath);
    return {
      path: input.path,
      size: stats.size,
      created: stats.birthtime.getTime(),
      modified: stats.mtime.getTime(),
      isDirectory: stats.isDirectory(),
    };
  });

  registerOperationHandler('file_delete', async (input: { path: string }, signal) => {
    const fullPath = path.resolve(process.cwd(), input.path);
    await fs.unlink(fullPath);
    return { path: input.path, deleted: true };
  });

  registerOperationHandler('file_read', async (input: { path: string }, signal) => {
    const fullPath = path.resolve(process.cwd(), input.path);
    const content = await fs.readFile(fullPath, 'utf-8');
    const truncated = content.slice(0, 64000);
    return {
      path: input.path,
      content: truncated,
      truncated: truncated.length < content.length,
    };
  });

  registerOperationHandler('text_search', async (input: { glob: string; regex: string; surrounding: number }, signal) => {
    const files = globSync(input.glob, { cwd: process.cwd() });
    const pattern = new RegExp(input.regex, 'g');
    const results: any[] = [];

    for (const file of files) {
      const fullPath = path.resolve(process.cwd(), file);
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          const start = Math.max(0, i - input.surrounding);
          const end = Math.min(lines.length, i + input.surrounding + 1);
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
  });

  registerOperationHandler('dir_create', async (input: { path: string }, signal) => {
    const fullPath = path.resolve(process.cwd(), input.path);
    await fs.mkdir(fullPath, { recursive: true });
    return { path: input.path, created: true };
  });

  // ============================================================================
  // Secretary Handlers
  // ============================================================================

  registerOperationHandler('assistant_switch', async (input: { name: string }, signal) => {
    await config.load();
    await config.updateChat(chatId, { assistant: input.name });
    return { assistant: input.name };
  });

  registerOperationHandler('assistant_update', async (input: { name: string; prompt: string }, signal) => {
    await config.load();
    const assistants = config.getData().assistants;
    const assistant = assistants.find((a) => a.name === input.name);

    if (!assistant) {
      throw new Error(`Assistant not found: ${input.name}`);
    }

    await config.save((data) => {
      const asst = data.assistants.find((a) => a.name === input.name);
      if (asst) {
        asst.prompt = input.prompt;
      }
    });

    return { name: input.name, updated: true };
  });

  registerOperationHandler('assistant_add', async (input: { name: string; prompt: string }, signal) => {
    await config.load();
    await config.addAssistant({
      name: input.name,
      prompt: input.prompt,
      created: Date.now(),
    });
    return { name: input.name, created: true };
  });

  registerOperationHandler('memory_list', async (input, signal) => {
    await config.load();
    const user = config.getData().user;
    return { memories: user.memory };
  });

  registerOperationHandler('memory_update', async (input: { content: string }, signal) => {
    await config.load();
    await config.addMemory(input.content);
    return { content: input.content, added: true };
  });

  // ============================================================================
  // Architect Handlers
  // ============================================================================

  registerOperationHandler('type_info', async (input: { name: string }, signal) => {
    await config.load();
    const types = config.getData().types;
    const type = types.find((t) => t.name === input.name);
    return { type: type || null };
  });

  registerOperationHandler('type_update', async (input: { name: string; update: any }, signal) => {
    await config.load();
    const types = config.getData().types;
    const type = types.find((t) => t.name === input.name);

    if (!type) {
      throw new Error(`Type not found: ${input.name}`);
    }

    // TODO: Validate backwards compatibility
    await config.save((data) => {
      const t = data.types.find((t) => t.name === input.name);
      if (t) {
        if (input.update.friendlyName) t.friendlyName = input.update.friendlyName;
        if (input.update.description) t.description = input.update.description;
        // Handle field updates
      }
    });

    return { name: input.name, updated: true };
  });

  registerOperationHandler('type_create', async (input: any, signal) => {
    await config.load();
    await config.addType(input);
    return { name: input.name, created: true };
  });

  // ============================================================================
  // DBA Handlers
  // ============================================================================

  registerOperationHandler('data_create', async (input: { name: string; fields: any }, signal) => {
    const dataManager = new DataManager(input.name);
    await dataManager.load();
    const id = await dataManager.create(input.fields);
    return { id, name: input.name };
  });

  registerOperationHandler('data_update', async (input: { name: string; id: string; fields: any }, signal) => {
    const dataManager = new DataManager(input.name);
    await dataManager.load();
    await dataManager.update(input.id, input.fields);
    return { id: input.id, updated: true };
  });

  registerOperationHandler('data_delete', async (input: { name: string; id: string }, signal) => {
    const dataManager = new DataManager(input.name);
    await dataManager.load();
    await dataManager.delete(input.id);
    return { id: input.id, deleted: true };
  });

  registerOperationHandler('data_select', async (input: { name: string; where: any; offset: number; limit: number; orderBy: any[] }, signal) => {
    const dataManager = new DataManager(input.name);
    await dataManager.load();

    // TODO: Implement proper query logic
    let results = dataManager.getAll();

    return { count: results.length, results: results.slice(input.offset, input.offset + input.limit) };
  });

  registerOperationHandler('data_update_many', async (input: { name: string; set: any; where: any }, signal) => {
    const dataManager = new DataManager(input.name);
    await dataManager.load();

    // TODO: Implement bulk update with where clause
    return { updated: 0 };
  });

  registerOperationHandler('data_delete_many', async (input: { name: string; where: any }, signal) => {
    const dataManager = new DataManager(input.name);
    await dataManager.load();

    // TODO: Implement bulk delete with where clause
    return { deleted: 0 };
  });

  registerOperationHandler('data_aggregate', async (input: { name: string; where: any; having: any; groupBy: string[]; orderBy: any[]; select: any[] }, signal) => {
    const dataManager = new DataManager(input.name);
    await dataManager.load();

    // TODO: Implement aggregation
    return { results: [] };
  });
}
