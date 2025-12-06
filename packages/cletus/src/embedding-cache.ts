import fs from 'fs/promises';
import { getCachePath } from './file-manager';
import { logger } from './logger';
import crypto from 'crypto';

/**
 * Cache storage structure - simple text => vector mapping
 */
interface CacheData {
  version: number;
  entries: Record<string, number[]>;
}

let cache: CacheData | null = null;
let cacheLoaded = false;

/**
 * Generate a hash key for text
 */
function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Load the cache from disk
 */
export async function loadCache(): Promise<void> {
  if (cacheLoaded) {
    return;
  }

  try {
    const cachePath = getCachePath();
    const content = await fs.readFile(cachePath, 'utf-8');
    cache = JSON.parse(content);
    logger.log(`Cache: Loaded ${Object.keys(cache?.entries || {}).length} cached vectors`);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // Cache file doesn't exist yet
      cache = { version: 1, entries: {} };
      logger.log('Cache: No cache file found, starting fresh');
    } else {
      logger.log(`Cache: Failed to load: ${error.message}`);
      cache = { version: 1, entries: {} };
    }
  } finally {
    cacheLoaded = true;
  }
}

/**
 * Save the cache to disk
 */
export async function saveCache(): Promise<void> {
  if (!cache) {
    return;
  }

  try {
    const cachePath = getCachePath();
    await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
    logger.log(`Cache: Saved ${Object.keys(cache.entries).length} cached vectors`);
  } catch (error: any) {
    logger.log(`Cache: Failed to save: ${error.message}`);
  }
}

/**
 * Get cached vector for text
 */
export async function getCachedVector(text: string): Promise<number[] | null> {
  await loadCache();

  if (!cache) {
    return null;
  }

  const key = hashText(text);
  return cache.entries[key] || null;
}

/**
 * Set cached vector for text
 */
export async function setCachedVector(text: string, vector: number[]): Promise<void> {
  await loadCache();

  if (!cache) {
    cache = { version: 1, entries: {} };
  }

  const key = hashText(text);
  cache.entries[key] = vector;

  // Save immediately to persist the cache
  await saveCache();
}

/**
 * Clear all cached vectors
 */
export async function clearCache(): Promise<void> {
  cache = { version: 1, entries: {} };
  await saveCache();
  logger.log('Cache: Cleared all cached vectors');
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{ count: number; version: number }> {
  await loadCache();
  return {
    count: Object.keys(cache?.entries || {}).length,
    version: cache?.version || 1,
  };
}
