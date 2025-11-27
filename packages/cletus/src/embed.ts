import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { getModelCachePath } from './file-manager';

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

let worker: Worker | null = null;
let workerReady: Promise<boolean> | null = null;
let messageId = 0;
const pendingMessages = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();

function getWorkerPath(): string {
    // In the bundled build, the worker file will be in the same directory
    // __dirname is provided by the esbuild banner
    const currentDir = typeof __dirname !== 'undefined' 
        ? __dirname 
        : path.dirname(fileURLToPath(import.meta.url));
    return path.join(currentDir, 'embed-worker.js');
}

function createWorker(): Worker {
    const workerPath = getWorkerPath();
    const cacheDir = getModelCachePath();
    
    const newWorker = new Worker(workerPath, {
        workerData: { cacheDir },
    });

    newWorker.on('message', (response: WorkerResponse) => {
        const pending = pendingMessages.get(response.id);
        if (pending) {
            pendingMessages.delete(response.id);
            if (response.success) {
                pending.resolve(response.result);
            } else {
                pending.reject(new Error(response.error || 'Unknown error'));
            }
        }
    });

    newWorker.on('error', (error) => {
        console.error('Embedding worker error:', error);
        // Reject all pending messages
        for (const [id, pending] of pendingMessages) {
            pending.reject(error);
            pendingMessages.delete(id);
        }
    });

    newWorker.on('exit', (code) => {
        if (code !== 0) {
            console.error(`Embedding worker exited with code ${code}`);
        }
        // Reset worker state so it can be recreated
        worker = null;
        workerReady = null;
    });

    return newWorker;
}

function sendMessage<T>(message: Omit<WorkerMessage, 'id'>): Promise<T> {
    return new Promise((resolve, reject) => {
        if (!worker) {
            reject(new Error('Worker not initialized'));
            return;
        }

        const id = ++messageId;
        pendingMessages.set(id, { resolve, reject });
        worker.postMessage({ ...message, id });
    });
}

async function initWorker(): Promise<boolean> {
    if (!workerReady) {
        workerReady = (async () => {
            try {
                worker = createWorker();
                const cacheDir = getModelCachePath();
                const success = await sendMessage<boolean>({ type: 'init', cacheDir });
                return success;
            } catch (err) {
                console.error('Failed to initialize embedding worker:', err);
                worker = null;
                return false;
            }
        })();
    }
    return workerReady;
}

/**
 * Initialize the embedding model in a worker thread.
 * Call this early in the application lifecycle to pre-load the model.
 */
export async function getEmbeddingModel(): Promise<boolean> {
    return initWorker();
}

/**
 * Check if embedding is available.
 */
export async function canEmbed(): Promise<boolean> {
    const initialized = await initWorker();
    if (!initialized || !worker) {
        return false;
    }
    try {
        return await sendMessage<boolean>({ type: 'canEmbed' });
    } catch {
        return false;
    }
}

/**
 * Generate embeddings for the given texts using a worker thread.
 * This runs in a separate process to avoid blocking the UI.
 */
export async function embed(text: string[]): Promise<number[][] | null> {
    const initialized = await initWorker();
    if (!initialized || !worker) {
        return null;
    }

    try {
        const result = await sendMessage<number[][]>({ type: 'embed', texts: text });
        return result;
    } catch (err) {
        console.error('Embedding failed:', err);
        return null;
    }
}