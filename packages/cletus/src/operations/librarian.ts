import { operationOf } from "./types";
import { KnowledgeFile } from "../knowledge";
import { getModel } from "@aits/core";

export const knowledge_search = operationOf<
  { query: string; limit?: number; sourcePrefix?: string },
  { query: string; results: Array<{ source: string; text: string; similarity: number }> }
>({
  mode: 'read',
  analyze: async (input, ctx) => {
    const limit = input.limit || 10;
    const prefix = input.sourcePrefix ? ` with source prefix "${input.sourcePrefix}"` : '';
    return {
      analysis: `This will search knowledge for "${input.query}"${prefix}, returning up to ${limit} results.`,
      doable: true,
    };
  },
  do: async (input, { ai }) => {
    const knowledge = new KnowledgeFile();
    await knowledge.load();

    const limit = input.limit || 10;
    
    // Generate embedding for query
    const embeddingResult = await ai.embed.get({ texts: [input.query] });
    const modelId = getModel(embeddingResult.model).id;
    const queryVector = embeddingResult.embeddings[0].embedding;

    // Search for similar entries
    const similarEntries = knowledge.searchBySimilarity(modelId, queryVector, limit);

    // Filter by source prefix if provided
    let filteredEntries = similarEntries;
    if (input.sourcePrefix) {
      filteredEntries = similarEntries.filter((result) =>
        result.entry.source.startsWith(input.sourcePrefix!)
      );
    }

    return {
      query: input.query,
      results: filteredEntries.map((result) => ({
        source: result.entry.source,
        text: result.entry.text,
        similarity: result.similarity,
      })),
    };
  },
});

export const knowledge_sources = operationOf<{}, { sources: string[] }>({
  mode: 'local',
  analyze: async (input, ctx) => {
    return {
      analysis: 'This will list all unique source prefixes in the knowledge base.',
      doable: true,
    };
  },
  do: async (input, ctx) => {
    const knowledge = new KnowledgeFile();
    await knowledge.load();

    const sources = new Set<string>();
    const data = knowledge.getData();

    for (const entries of Object.values(data.knowledge)) {
      for (const entry of entries) {
        const prefix = entry.source.substring(0, entry.source.lastIndexOf(':'));
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
    return {
      analysis: `This will add user knowledge: "${preview}"`,
      doable: true,
    };
  },
  do: async (input, { ai }) => {
    const knowledge = new KnowledgeFile();
    await knowledge.load();

    const source = `user:${Date.now()}`;

    // Generate embedding
    const embeddingResult = await ai.embed.get({ texts: [input.text] });
    const modelId = getModel(embeddingResult.model).id;
    const vector = embeddingResult.embeddings[0].embedding;

    // Store in knowledge base
    await knowledge.addEntry(modelId, {
      source,
      text: input.text,
      vector,
    });

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

    const data = knowledge.getData();
    let count = 0;

    for (const entries of Object.values(data.knowledge)) {
      count += entries.filter((e) => e.source.startsWith(input.sourcePrefix)).length;
    }

    return {
      analysis: `This will delete ${count} knowledge entries with source prefix "${input.sourcePrefix}".`,
      doable: true,
    };
  },
  do: async (input, ctx) => {
    const knowledge = new KnowledgeFile();
    await knowledge.load();

    const data = knowledge.getData();
    let count = 0;

    // Count entries to delete
    for (const entries of Object.values(data.knowledge)) {
      count += entries.filter((e) => e.source.startsWith(input.sourcePrefix)).length;
    }

    // Delete all matching sources
    const sources = new Set<string>();
    for (const entries of Object.values(data.knowledge)) {
      for (const entry of entries) {
        if (entry.source.startsWith(input.sourcePrefix)) {
          sources.add(entry.source);
        }
      }
    }

    for (const source of sources) {
      await knowledge.deleteBySource(source);
    }

    return { sourcePrefix: input.sourcePrefix, deletedCount: count };
  },
});
