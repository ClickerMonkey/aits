import { JsonFile, getKnowledgePath } from './file-manager.js';
import { KnowledgeSchema, type Knowledge, type KnowledgeEntry } from './schemas.js';

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
    topK: number = 5
  ): Array<{ entry: KnowledgeEntry; similarity: number }> {
    const entries = this.getEntries(model);

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

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}
