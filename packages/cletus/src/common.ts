
/**
 * Formats time in milliseconds to a human-readable string.
 * 
 * @param ms - time in milliseconds
 * @returns 
 */
export function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  } else {
    return `${(ms / 1000).toFixed(1)}s`;
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