import { EmbeddingModel, FlagEmbedding } from 'fastembed';
import { getModelCachePath } from './file-manager';

let modelPrompise: Promise<FlagEmbedding | null> | null = null;

export async function getEmbeddingModel(): Promise<FlagEmbedding | null> {
    if (!modelPrompise) {
        modelPrompise = (async () => {
            try {
                return await FlagEmbedding.init({
                    model: EmbeddingModel.BGEBaseENV15,
                    cacheDir: getModelCachePath(),
                });
            } catch (err) {
                console.error('Failed to load embedding model:', err);
                return null;
            }
        })();
    }
    return modelPrompise;
}

export async function canEmbed(): Promise<boolean> {
    const embeddingModel = await getEmbeddingModel();
    return embeddingModel !== null;
}

export async function embed(text: string[]): Promise<number[][] | null> {
    const embeddingModel = await getEmbeddingModel();
    if (!embeddingModel) {
        return null;
    }

    const batches = embeddingModel.embed(text);
    const results: number[][] = [];
    for await (const batch of batches) {
        results.push(...batch.map(x => Array.prototype.slice.call(x)));
    }
    return results;
}