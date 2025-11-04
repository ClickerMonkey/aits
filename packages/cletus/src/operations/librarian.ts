import { CletusCoreContext } from "../ai";
import { operationOf } from "./types";
import { KnowledgeFile } from "../knowledge";

export const knowledge_search = operationOf<
  { query: string; limit?: number; sourcePrefix?: string },
  { query: string; results: any[] }
>({
  mode: 'read',
  analyze: async (input, ctx) => {
    const limit = input.limit || 10;
    const prefix = input.sourcePrefix ? ` with source prefix "${input.sourcePrefix}"` : '';
    return `This will search knowledge for "${input.query}"${prefix}, returning up to ${limit} results.`;
  },
  do: async (input, ctx) => {
    const knowledge = new KnowledgeFile();
    await knowledge.load();

    const limit = input.limit || 10;

    // TODO: Generate embedding for query and perform similarity search
    // For now return structure
    return {
      query: input.query,
      results: [],
    };
  },
});

export const knowledge_sources = operationOf<{}, { sources: string[] }>({
  mode: 'read',
  analyze: async (input, ctx) => {
    return 'This will list all unique source prefixes in the knowledge base.';
  },
  do: async (input, ctx) => {
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
  },
});

export const knowledge_add = operationOf<
  { text: string },
  { source: string; added: boolean }
>({
  mode: 'create',
  analyze: async (input, ctx) => {
    const preview = input.text.length > 50 ? input.text.substring(0, 50) + '...' : input.text;
    return `This will add user memory: "${preview}"`;
  },
  do: async (input, ctx) => {
    const knowledge = new KnowledgeFile();
    await knowledge.load();

    const source = 'user';

    // TODO: Generate embedding and store
    // For now just structure
    return { source, added: true };
  },
});

export const knowledge_delete = operationOf<
  { sourcePrefix: string },
  { sourcePrefix: string; deletedCount: number }
>({
  mode: 'delete',
  analyze: async (input, ctx) => {
    const knowledge = new KnowledgeFile();
    await knowledge.load();

    const sources = Object.keys(knowledge.getData().knowledge).filter((s) =>
      s.startsWith(input.sourcePrefix)
    );

    return `This will delete ${sources.length} knowledge entries with source prefix "${input.sourcePrefix}".`;
  },
  do: async (input, ctx) => {
    const knowledge = new KnowledgeFile();
    await knowledge.load();

    const sources = Object.keys(knowledge.getData().knowledge).filter((s) =>
      s.startsWith(input.sourcePrefix)
    );

    for (const source of sources) {
      await knowledge.deleteBySource(source);
    }

    return { sourcePrefix: input.sourcePrefix, deletedCount: sources.length };
  },
});
