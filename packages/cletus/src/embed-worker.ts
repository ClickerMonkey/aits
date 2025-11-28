import { parentPort, workerData } from 'worker_threads';
import { EmbeddingModel, FlagEmbedding } from 'fastembed';

interface WorkerMessage {
    type: 'init' | 'embed' | 'canEmbed';
    id: number;
    cacheDir?: string;
    texts?: string[];
}

interface WorkerResponse {
    type: 'init' | 'embed' | 'canEmbed';
    id: number;
    success: boolean;
    error?: string;
    result?: number[][] | boolean;
}

let embeddingModel: FlagEmbedding | null = null;
let initPromise: Promise<FlagEmbedding | null> | null = null;

async function initModel(cacheDir: string): Promise<FlagEmbedding | null> {
    if (!initPromise) {
        initPromise = (async () => {
            try {
                return await FlagEmbedding.init({
                    model: EmbeddingModel.BGEBaseENV15,
                    cacheDir,
                });
            } catch (err) {
                console.error('Worker: Failed to load embedding model:', err);
                return null;
            }
        })();
    }
    return initPromise;
}

async function handleMessage(message: WorkerMessage): Promise<WorkerResponse> {
    const { type, id } = message;

    try {
        switch (type) {
            case 'init': {
                embeddingModel = await initModel(message.cacheDir!);
                return {
                    type: 'init',
                    id,
                    success: embeddingModel !== null,
                    result: embeddingModel !== null,
                };
            }
            case 'canEmbed': {
                return {
                    type: 'canEmbed',
                    id,
                    success: true,
                    result: embeddingModel !== null,
                };
            }
            case 'embed': {
                if (!embeddingModel) {
                    return {
                        type: 'embed',
                        id,
                        success: false,
                        error: 'Embedding model not initialized',
                    };
                }

                const batches = embeddingModel.embed(message.texts!);
                const results: number[][] = [];
                for await (const batch of batches) {
                    results.push(...batch.map(x => Array.prototype.slice.call(x)));
                }
                return {
                    type: 'embed',
                    id,
                    success: true,
                    result: results,
                };
            }
            default:
                return {
                    type,
                    id,
                    success: false,
                    error: `Unknown message type: ${type}`,
                };
        }
    } catch (error) {
        return {
            type,
            id,
            success: false,
            error: (error as Error).message,
        };
    }
}

if (parentPort) {
    parentPort.on('message', async (message: WorkerMessage) => {
        const response = await handleMessage(message);
        parentPort!.postMessage(response);
    });

    // Auto-initialize if cacheDir is provided via workerData
    if (workerData?.cacheDir) {
        initModel(workerData.cacheDir).then((model) => {
            embeddingModel = model;
        });
    }
}
