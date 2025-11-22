import { cosineSimilarity } from './common';
import { JsonFile, getKnowledgePath } from './file-manager';
import { KnowledgeSchema, type Knowledge, type KnowledgeEntry } from './schemas';

/**
 * Knowledge file manager for storing embeddings
 */
export class KnowledgeFile extends JsonFile<Knowledge> {
  constructor() {
    const initialData: Knowledge = {
      updated: Date.now(),
      knowledge: {},
    };

    super(getKnowledgePath(), initialData);
  }

  protected validate(parsed: any): Knowledge {
    return KnowledgeSchema.parse(parsed);
  }

  protected getUpdatedTimestamp(data: any): number {
    return data.updated;
  }

  protected setUpdatedTimestamp(data: Knowledge, timestamp: number): void {
    data.updated = timestamp;
  }

  /**
   * Add a knowledge entry for a specific embedding model
   */
  async addEntry(model: string, entry: Omit<KnowledgeEntry, 'created'>): Promise<void> {
    await this.save((knowledge) => {
      if (!knowledge.knowledge[model]) {
        knowledge.knowledge[model] = [];
      }
      knowledge.knowledge[model].push({
        ...entry,
        created: Date.now(),
      });
    });
  }
  
  /**
   * Add a knowledge entry for a specific embedding model
   */
  async addEntries(model: string, entries: KnowledgeEntry[]): Promise<void> {
    await this.save((knowledge) => {
      if (!knowledge.knowledge[model]) {
        knowledge.knowledge[model] = [];
      }
      knowledge.knowledge[model].push(...entries);
    });
  }

  /**
   * Update an existing knowledge entry
   */
  async updateEntry(
    model: string,
    source: string,
    updates: Partial<Omit<KnowledgeEntry, 'source' | 'created'>>
  ): Promise<void> {
    await this.save((knowledge) => {
      const entries = knowledge.knowledge[model];
      if (!entries) {
        throw new Error(`No entries for model ${model}`);
      }

      const entry = entries.find((e) => e.source === source);
      if (!entry) {
        throw new Error(`Entry with source ${source} not found`);
      }

      Object.assign(entry, updates);
      entry.updated = Date.now();
    });
  }

  /**
   * Delete knowledge entries by source
   */
  async deleteBySource(source: string): Promise<void> {
    await this.save((knowledge) => {
      for (const model in knowledge.knowledge) {
        knowledge.knowledge[model] = knowledge.knowledge[model].filter(
          (e) => e.source !== source
        );
      }
    });
  }

  /**
   * Delete knowledge entries matching a predicate function
   */
  async deleteWhere(predicate: (entry: KnowledgeEntry) => boolean): Promise<number> {
    return this.save((knowledge) => {
      let deletedCount = 0;
      for (const model in knowledge.knowledge) {
        const originalLength = knowledge.knowledge[model].length;
        knowledge.knowledge[model] = knowledge.knowledge[model].filter(
          (e) => !predicate(e)
        );
        deletedCount += originalLength - knowledge.knowledge[model].length;
      }
      return deletedCount;
    });
  }

  /**
   * Get all entries for a specific model
   */
  getEntries(model: string): KnowledgeEntry[] {
    return this.data.knowledge[model] || [];
  }

  /**
   * Search entries by similarity (cosine similarity)
   */
  searchBySimilarity(
    model: string,
    queryVector: number[],
    topK: number = 5,
    sourcePrefix?: string
  ): Array<{ entry: KnowledgeEntry; similarity: number }> {
    let entries = this.getEntries(model);

    // Filter by source prefix before computing similarities to optimize performance
    if (sourcePrefix) {
      entries = entries.filter((entry) => entry.source.startsWith(sourcePrefix));
    }

    const results = entries
      .map((entry) => ({
        entry,
        similarity: cosineSimilarity(queryVector, entry.vector),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return results;
  }
}
