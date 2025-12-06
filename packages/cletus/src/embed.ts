import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getModelCachePath } from './file-manager';
import { logger } from './logger';

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

    // Ensure cache directory exists before initializing worker
    fs.mkdirSync(cacheDir, { recursive: true });

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
        logger.log(`Embedding: Worker error: ${error}`);
        // Reject all pending messages
        for (const [id, pending] of pendingMessages) {
            pending.reject(error);
            pendingMessages.delete(id);
        }
    });

    newWorker.on('exit', (code) => {
        if (code !== 0) {
            logger.log(`Embedding: Worker exited with code ${code}`);
        }
        // Reset worker state so it can be recreated
        worker = null;
        workerReady = null;
    });

    return newWorker;
}

function sendMessage<T>(message: Omit<WorkerMessage, 'id'>, signal?: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
        if (!worker) {
            reject(new Error('Worker not initialized'));
            return;
        }

        const id = ++messageId;

        // Set up abort handler
        const abortHandler = () => {
            const pending = pendingMessages.get(id);
            if (pending) {
                pendingMessages.delete(id);
                reject(new Error('Operation cancelled'));
            }
        };

        if (signal) {
            if (signal.aborted) {
                reject(new Error('Operation cancelled'));
                return;
            }
            signal.addEventListener('abort', abortHandler);
        }

        pendingMessages.set(id, {
            resolve: (value) => {
                if (signal) {
                    signal.removeEventListener('abort', abortHandler);
                }
                resolve(value);
            },
            reject: (error) => {
                if (signal) {
                    signal.removeEventListener('abort', abortHandler);
                }
                reject(error);
            }
        });

        worker.postMessage({ ...message, id });
    });
}

export async function initWorker(): Promise<boolean> {
    if (!workerReady) {
        workerReady = (async () => {
            const start = performance.now();
            try {
                worker = createWorker();
                const cacheDir = getModelCachePath();
                const success = await sendMessage<boolean>({ type: 'init', cacheDir });
                logger.log(`Embedding: Worker initialized successfully: ${success}`);
                return success;
            } catch (err) {
                logger.log(`Embedding: Failed to initialize: ${err}`);
                worker = null;
                return false;
            } finally {
                const duration = performance.now() - start;
                logger.log(`Embedding: Worker initialized in ${duration.toFixed(2)} ms`);
            }
        })();
    }
    return workerReady;
}

/**
 * Check if embedding is available.
 */
export async function canEmbed(): Promise<boolean> {
    const started = performance.now();
    const initialized = await initWorker();
    if (!initialized || !worker) {
        return false;
    }
    try {
        return await sendMessage<boolean>({ type: 'canEmbed' });
    } catch {
        return false;
    } finally {
        const duration = performance.now() - started;
        logger.log(`Embedding: canEmbed check took ${duration.toFixed(2)} ms`);
    }
}

/**
 * Generate embeddings for the given texts using a worker thread.
 * This runs in a separate thread to avoid blocking the UI.
 */
export async function embed(text: string[], signal?: AbortSignal): Promise<number[][] | null> {
    // Check if cancelled before starting
    if (signal?.aborted) {
        throw new Error('Operation cancelled');
    }

    const start = performance.now();
    const initialized = await initWorker();
    if (!initialized || !worker) {
        return null;
    }

    // Check again after initialization
    if (signal?.aborted) {
        throw new Error('Operation cancelled');
    }

    try {
        const result = await sendMessage<number[][]>({ type: 'embed', texts: text }, signal);
        return result;
    } catch (err) {
        logger.log(`Embedding: Embedding failed: ${err}`);
        return null;
    } finally {
        const duration = performance.now() - start;
        logger.log(`Embedding: Embedding ${text.length} texts took ${duration.toFixed(2)} ms`);
    }
}