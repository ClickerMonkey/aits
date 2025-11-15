import { getModel } from "@aits/core";
import { abbreviate } from "../common";
import { KnowledgeFile } from "../knowledge";
import { operationOf } from "./types";
import { renderOperation } from "../helpers/render";

export const knowledge_search = operationOf<
  { query: string; limit?: number; sourcePrefix?: string },
  { query: string; results: Array<{ source: string; text: string; similarity: number }> }
>({
  mode: 'read',
  signature: 'knowledge_search(query: string, limit?: number, sourcePrefix?: string)',
  status: (input) => `Searching knowledge: ${abbreviate(input.query, 35)}`,
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

    // Search for similar entries, optionally filtering by source prefix
    const similarEntries = knowledge.searchBySimilarity(modelId, queryVector, limit, input.sourcePrefix);

    return {
      query: input.query,
      results: similarEntries.map((result) => ({
        source: result.entry.source,
        text: result.entry.text,
        similarity: result.similarity,
      })),
    };
  },
  render: (op, config, showDetails) => renderOperation(
    op,
    `KnowledgeSearch("${abbreviate(op.input.query, 25)}")`,
    (op) => {
      if (op.output) {
        const count = op.output.results.length;
        return `Found ${count} result${count !== 1 ? 's' : ''}`;
      }
      return null;
    }
  , showDetails),
});

export const knowledge_sources = operationOf<{}, { sources: string[] }>({
  mode: 'local',
  signature: 'knowledge_sources()',
  status: () => 'Listing knowledge sources',
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
  render: (op, config, showDetails) => renderOperation(
    op,
    'KnowledgeSources()',
    (op) => {
      if (op.output) {
        const count = op.output.sources.length;
        return `Listed ${count} source${count !== 1 ? 's' : ''}`;
      }
      return null;
    }
  , showDetails),
});

export const knowledge_add = operationOf<
  { text: string },
  { source: string; added: boolean }
>({
  mode: 'create',
  signature: 'knowledge_add(text: string)',
  status: (input) => `Adding knowledge: ${abbreviate(input.text, 40)}`,
  analyze: async (input, ctx) => {
    return {
      analysis: `This will add user knowledge: "${abbreviate(input.text, 50)}"`,
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
  render: (op, config, showDetails) => renderOperation(
    op,
    `KnowledgeAdd("${abbreviate(op.input.text, 30)}")`,
    (op) => {
      if (op.output) {
        return `Added: "${abbreviate(op.input.text, 50)}"`;
      }
      return null;
    }
  , showDetails),
});

export const knowledge_delete = operationOf<
  { sourcePrefix: string },
  { sourcePrefix: string; deletedCount: number }
>({
  mode: 'delete',
  signature: 'knowledge_delete(sourcePrefix: string)',
  status: (input) => `Deleting knowledge: ${input.sourcePrefix}`,
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
  render: (op, config, showDetails) => renderOperation(
    op,
    `KnowledgeDelete("${op.input.sourcePrefix}")`,
    (op) => {
      if (op.output) {
        return `Deleted ${op.output.deletedCount} entr${op.output.deletedCount !== 1 ? 'ies' : 'y'}`;
      }
      return null;
    }
  , showDetails),
});
