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
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `KnowledgeSearch("${abbreviate(op.input.query, 25)}")`,
    (op) => {
      if (op.output) {
        const count = op.output.results.length;
        return `Found ${count} result${count !== 1 ? 's' : ''}`;
      }
      return null;
    }
  , showInput, showOutput),
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
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    'KnowledgeSources()',
    (op) => {
      if (op.output) {
        const count = op.output.sources.length;
        return `Listed ${count} source${count !== 1 ? 's' : ''}`;
      }
      return null;
    }
  , showInput, showOutput),
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
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `KnowledgeAdd("${abbreviate(op.input.text, 30)}")`,
    (op) => {
      if (op.output) {
        return `Added: "${abbreviate(op.input.text, 50)}"`;
      }
      return null;
    }
  , showInput, showOutput),
});

export const knowledge_delete = operationOf<
  { sourcePattern: string; caseSensitive?: boolean },
  { deletedCount: number }
>({
  mode: 'delete',
  signature: 'knowledge_delete(sourcePattern: string, caseSensitive?: boolean)',
  status: (input) => `Deleting knowledge: ${input.sourcePattern}`,
  analyze: async (input, ctx) => {
    // Validate regex pattern
    let regex: RegExp;
    try {
      const flags = input.caseSensitive === false ? 'i' : '';
      regex = new RegExp(input.sourcePattern, flags);
    } catch (error) {
      return {
        analysis: `Invalid regex pattern "${input.sourcePattern}": ${error instanceof Error ? error.message : String(error)}`,
        doable: false,
      };
    }

    const knowledge = new KnowledgeFile();
    await knowledge.load();

    const data = knowledge.getData();
    const matchingSources = new Set<string>();
    let count = 0;

    // Find all matching sources
    for (const entries of Object.values(data.knowledge)) {
      for (const entry of entries) {
        if (regex.test(entry.source)) {
          matchingSources.add(entry.source);
          count++;
        }
      }
    }

    const sourceList = Array.from(matchingSources).sort();
    const topTen = sourceList.slice(0, 10);
    const caseSensitiveStr = input.caseSensitive === false ? ' (case-insensitive)' : '';
    
    let analysis = `This will delete ${count} knowledge entr${count !== 1 ? 'ies' : 'y'} matching pattern "${input.sourcePattern}"${caseSensitiveStr}.`;
    
    if (topTen.length > 0) {
      analysis += `\n\nTop ${topTen.length} matching sources:`;
      topTen.forEach((source, i) => {
        analysis += `\n  ${i + 1}. ${source}`;
      });
      
      if (sourceList.length > 10) {
        analysis += `\n  ... and ${sourceList.length - 10} more`;
      }
    } else {
      analysis += '\n\nNo matching entries found.';
    }

    return {
      analysis,
      doable: true,
    };
  },
  do: async (input, ctx) => {
    // Validate regex pattern
    let regex: RegExp;
    try {
      const flags = input.caseSensitive === false ? 'i' : '';
      regex = new RegExp(input.sourcePattern, flags);
    } catch (error) {
      throw new Error(`Invalid regex pattern "${input.sourcePattern}": ${error instanceof Error ? error.message : String(error)}`);
    }

    const knowledge = new KnowledgeFile();
    await knowledge.load();

    // Delete entries matching the pattern
    const deletedCount = await knowledge.deleteWhere((entry) => regex.test(entry.source));

    return { deletedCount };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `KnowledgeDelete("${op.input.sourcePattern}")`,
    (op) => {
      if (op.output) {
        return `Deleted ${op.output.deletedCount} entr${op.output.deletedCount !== 1 ? 'ies' : 'y'}`;
      }
      return null;
    }
  , showInput, showOutput),
});
