/**
 * Shared utility functions that work in both Node.js and browser environments.
 * This file should NOT import any Node.js-specific modules (fs, path, etc).
 */

/**
 * Formats time in milliseconds to a human-readable string.
 *
 * @param ms - time in milliseconds
 * @returns
 */
export function formatTime(ms: number): string {
  if (ms < 1) {
    return `${ms.toFixed(2)}ms`;
  } if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  } else {
    return `${(ms / 1000).toFixed(1)}s`;
  }
}

/**
 * Formats a file size in bytes to a human-readable string.
 *
 * @param bytes - file size in bytes
 * @returns formatted string like "1.5 KB", "2.3 MB", etc.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}

/**
 * Formats name by converting camelCase, underscores, and hyphens to TitleCase.
 *
 * @param x - input string
 * @returns
 */
export function formatName(x: string): string {
  return x
    .replace(/([a-z])([A-Z])/g, '$1$2') // camelCase to words
    .replace(/[_-]+/g, ' ')               // underscores/hyphens to spaces
    .replace(/\s+/g, ' ')                 // multiple spaces to single space
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) // capitalize first letter of each word
    .replace(/\s+/g, '');
}

/**
 * Abbreviate text to a maximum length, adding ellipsis if truncated.
 *
 * @param text - input text
 * @param maxLength - maximum length
 * @returns
 */
export function abbreviate(text: string, maxLength: number, suffix: string = '…'): string {
  if (text.length <= maxLength) {
    return text;
  } else {
    return text.slice(0, maxLength - suffix.length) + suffix;
  }
}

/**
 * Delete undefined properties from an object.
 *
 * @param obj - input object
 * @returns
 */
export function deleteUndefined<T>(obj: T): T {
  for (const key in obj) {
    if (obj[key] === undefined) {
      delete obj[key];
    }
  }
  return obj;
}

/**
 * Pluralize a word based on count.
 *
 * @param count - number of items
 * @param singular - singular form of the word
 * @param plural - plural form of the word
 * @param prefixCount - whether to prefix the count number
 * @returns pluralized string
 */
export function pluralize(
  count: number,
  singular: string,
  plural: string = singular + 's',
  prefixCount: boolean = true,
): string {
  const unit = count === 1 ? singular : plural;
  return prefixCount ? `${count} ${unit}` : unit;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
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

/**
 * Chunk an array into smaller arrays of a specified size.
 *
 * @param array - input array
 * @param chunkSize - size of each chunk
 * @returns
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Chunk an array based on a predicate function.
 *
 * @param array - input array
 * @param newChunk - function to determine if a new chunk should start
 * @returns
 */
export function chunk<T>(array: T[], newChunk: (prev: T, next: T, i: number) => boolean): T[][] {
  const chunks: T[][] = [];
  let currentChunk: T[] = [];
  for (let i = 0; i < array.length; i++) {
    if (currentChunk.length === 0) {
      currentChunk.push(array[i]);
    } else {
      if (newChunk(currentChunk[currentChunk.length - 1], array[i], i)) {
        chunks.push(currentChunk);
        currentChunk = [array[i]];
      } else {
        currentChunk.push(array[i]);
      }
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  return chunks;
}

/**
 * Groups items in an array by a key function, with optional value extraction and reduction.
 *
 * @param array - The items to group
 * @param keyFn - Function to extract the key for grouping
 * @param valueFn - Function to extract the value for each item
 * @param reduceFn - Function to reduce the grouped values
 * @returns The grouped and reduced map
 */
export function groupMap<T, K, V = T, R = V[]>(
  array: T[],
  keyFn: (item: T) => K,
  valueFn?: (item: T) => V,
  reduceFn?: (items: V[]) => R,
): Map<K, R> {
  const value = valueFn || ((item: T) => item as unknown as V);
  const reduce = reduceFn || ((items: V[]) => items as unknown as R);

  const valueMap = new Map<K, V[]>();
  for (const item of array) {
    const key = keyFn(item);
    const group = valueMap.get(key) || [];
    group.push(value(item));
    valueMap.set(key, group);
  }

  const reducedMap = new Map<K, R>();
  valueMap.forEach((items, key) => {
    reducedMap.set(key, reduce(items));
  });

  return reducedMap;
}

/**
 * Groups items in an array by a key function, with optional value extraction and reduction.
 *
 * @param array - The items to group
 * @param keyFn - Function to extract the key for grouping
 * @param valueFn - Function to extract the value for each item
 * @param reduceFn - Function to reduce the grouped values
 * @returns The grouped and reduced object
 */
export function group<T, K extends PropertyKey, V = T, R = V[]>(
  array: T[],
  keyFn: (item: T) => K,
  valueFn?: (item: T) => V,
  reduceFn?: (items: V[]) => R,
): Record<K, R> {
  return Object.fromEntries(groupMap(array, keyFn, valueFn, reduceFn).entries()) as Record<K, R>;
}

/**
 * Creates a gate function to serialize async operations.
 *
 * @returns A function that serializes async operations
 */
export function gate() {
  let keeper: Promise<void> = Promise.resolve();

  return async<T>(fn: () => Promise<T>): Promise<T> => {
    // Capture the current keeper immediately (before await)
    const prevKeeper = keeper;

    // Create the new keeper promise immediately
    let resolve!: () => void;
    let reject!: (err: any) => void;
    keeper = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    // Now wait for previous operation
    await prevKeeper;

    // Execute the function
    try {
      const result = await fn();
      resolve(); // Release next waiting operation
      return result;
    } catch (err) {
      reject(err); // Release next waiting operation with error
      throw err;
    }
  };
}

/**
 * Newline types that can be detected in text content.
 */
export type NewlineType = '\n' | '\r\n' | '\r';

/**
 * Detects the predominant newline type in the given text content.
 * Returns '\n' (LF) as the default if no newlines are found.
 *
 * @param content - The text content to analyze
 * @returns The detected newline type
 */
export function detectNewlineType(content: string): NewlineType {
  const crlfCount = (content.match(/\r\n/g) || []).length;
  // Remove CRLF first, then count standalone LF and CR
  const contentWithoutCrlf = content.replace(/\r\n/g, '');
  const lfCount = (contentWithoutCrlf.match(/\n/g) || []).length;
  const crCount = (contentWithoutCrlf.match(/\r/g) || []).length;

  // Default to LF if no newlines found
  if (crlfCount === 0 && lfCount === 0 && crCount === 0) {
    return '\n';
  }

  // Return the most common newline type
  if (crlfCount >= lfCount && crlfCount >= crCount) {
    return '\r\n';
  } else if (lfCount >= crCount) {
    return '\n';
  } else {
    return '\r';
  }
}

/**
 * Normalizes all newlines in text to LF (\n).
 *
 * @param content - The text content to normalize
 * @returns Content with all newlines converted to LF
 */
export function normalizeNewlines(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Converts LF newlines to the specified newline type.
 *
 * @param content - The text content with LF newlines
 * @param newlineType - The target newline type
 * @returns Content with newlines converted to the specified type
 */
export function convertNewlines(content: string, newlineType: NewlineType): string {
  if (newlineType === '\n') {
    return content;
  }
  return content.replace(/\n/g, newlineType);
}
