import fs from "fs";
import path from "path";
import { CONSTS } from "./constants";
import { Message, MessageContent } from "./schemas";
import { Message as AIMessage, MessageContent as AIMessageContent } from "@aeye/core";
import { detectMimeType } from "./helpers/files";

/**
 * Returns the appropriate label for the Alt/Option key based on the platform.
 * 
 * @returns "Opt" on macOS, "Alt" on other platforms
 */
export function getAltKeyLabel(): string {
  return process.platform === 'darwin' ? 'Opt' : 'Alt';
}

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
 * Format a value for text display (high-level representation without JSON escaping)
 * - Arrays: items on separate lines with hyphens
 * - Non-objects (primitives): String(x)
 * - Objects: bullet list with hyphens, property values without JSON escaping
 * 
 * @param value - value to format
 * @param alreadyIndented - whether content should be indented/hyphenated
 * @returns formatted string
 */
export function formatValue(value: any, alreadyIndented: boolean = false): string {
  // Handle null/undefined
  if (value === null) {
    return `null`;
  }
  if (value === undefined) {
    return `undefined`;
  }

  const hyphenPrefix = alreadyIndented ? '' : '- ';
  
  // Arrays: list items with hyphens
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `[]`;
    }
    return '\n' + value.map((item, i) => `${hyphenPrefix}${formatValue(item, true).split('\n').join('\n  ')}`).join('\n');
  }
  
  // Non-objects (primitives): use String(x)
  if (typeof value !== 'object') {
    const x = String(value);
    return !alreadyIndented && x.includes('\n') ? `\n  ${x.split('\n').join('\n  ')}` : x;
  }
  
  // Objects: bullet list with hyphens
  const entries = Object.entries(value).filter(([_, val]) => val !== undefined);
  if (entries.length === 0) {
    return '{}';
  }
  
  return entries.map(([key, val]) => {
    const prefix = `${hyphenPrefix}${key}:`;
    if (typeof val === 'object' && val !== null) {
      return `${prefix}\n  ${formatValue(val).split('\n').join('\n  ')}`;
    } else {
      return `${prefix} ${formatValue(val).split('\n').join('\n  ')}`;
    }
  }).join('\n');
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
 * Paginate text by characters or lines. Never returns more than 64k characters. 
 * In line mode it doesn't return more than 1k lines.
 * 
 * @param text - input text
 * @param limit - maximum length
 * @param offset - starting offset
 * @param limitOffsetMode - 'characters' or 'lines'
 * @returns 
 */
export function paginateText(
  text: string, 
  limit: number = 0,
  offset: number = 0,
  limitOffsetMode: 'characters' | 'lines' = 'characters',
): string {
 if (limitOffsetMode === 'lines') {
    const lines = text.split('\n');
    const max = Math.min(limit || CONSTS.MAX_LINES, CONSTS.MAX_LINES);
    if (lines.length <= max) {
      return text;
    }

    const start = (offset + lines.length) % lines.length;
    const end = start + max;
    let paginated = lines.slice(start, end);
    const characters = lines.reduce((sum, line) => sum + line.length + 1, 0); // +1 for newline

    if (characters <= CONSTS.MAX_CHARACTERS) {
      return paginated.join('\n');
    }

    return offset < 0 
      ? text.slice(-CONSTS.MAX_CHARACTERS) 
      : text.slice(0, CONSTS.MAX_CHARACTERS);
  } else { 
    const max = Math.min(limit || CONSTS.MAX_CHARACTERS, CONSTS.MAX_CHARACTERS);
    if (text.length < max) {
      return text;
    }

    const start = (offset + text.length) % text.length;
    const end = start + max;

    return text.slice(start, end);
  }
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
 * Converts a Message to a ChatMessage.
 * 
 * @param msg 
 * @returns 
 */
export async function convertMessage(msg: Message): Promise<AIMessage> {
  const contents = msg.content.slice();
  let nextRequest = 0;
  for (let i = 0; i < contents.length; i++) {
    const content = contents[i];
    if (content.operationIndex === undefined) {
      continue;
    }
    const operation = msg.operations?.[content.operationIndex];
    if (operation?.message) {
      content.content = operation.message;
    }
    if (operation?.requestIndex !== nextRequest) {
      continue;
    }
    const request = msg.requests?.[operation.requestIndex];
    if (!request) {
      continue;
    }
    contents.splice(i, 0, {
      type: 'text',
      content: `Delegated to agent "${request.agent}"${request.typeName ? ` for type ${request.typeName}` : ''}${request.simulateMode ? ` (mode=${request.simulateMode})`: ''} with request:\n${request.request}`,
    });
    nextRequest++;
    i++;
  }

  return {
    role: msg.role,
    name: msg.name,
    tokens: msg.tokens,
    content: await Promise.all(contents.map((mc) => convertMessageContent(mc, msg.created))),
  };
}

export const INPUT_START = '\n\n<input>\n';
export const INPUT_END = '\n</input>';
export const ANALYSIS_START = '\n\n<analysis>\n';
export const ANALYSIS_END = '\n</analysis>';
export const OUTPUT_START = '\n\n<output>\n';
export const OUTPUT_END = '\n</output>';
export const INSTRUCTIONS_START = '\n\n<instructions>\n';
export const INSTRUCTIONS_END = '\n</instructions>';

/**
 * 
 * @param messageContent - The message content to convert
 * @param messageTimestamp - The timestamp of the message (for operation output storage)
 * @returns 
 */
async function convertMessageContent(messageContent: MessageContent, messageTimestamp: number): Promise<AIMessageContent> {
  const { type, content, operationIndex } = messageContent;
  
  // Handle text content
  if (type === 'text') {
    // Check if this is an operation message that needs truncation
    if (operationIndex !== undefined && content.length > CONSTS.OPERATION_MESSAGE_TRUNCATE_LIMIT) {
      // Generate the truncation message
      const contentTruncated = content.slice(0, CONSTS.OPERATION_MESSAGE_TRUNCATE_LIMIT - CONSTS.OPERATION_MESSAGE_TRUNCATE_BUFFER);
      const truncatedAt = contentTruncated.indexOf(INPUT_START) >= 0 && contentTruncated.indexOf(INPUT_END) === -1
        ? 'input'
        : contentTruncated.indexOf(ANALYSIS_START) >= 0 && contentTruncated.indexOf(ANALYSIS_END) === -1
          ? 'analysis'
            : contentTruncated.indexOf(OUTPUT_START) >= 0 && contentTruncated.indexOf(OUTPUT_END) === -1
              ? 'output'
              : contentTruncated.indexOf(INSTRUCTIONS_START) >= 0 && contentTruncated.indexOf(INSTRUCTIONS_END) === -1
                ? 'instructions'
                : '';
      const sections = [
        ...(content.includes(INPUT_START) ? ['input'] : []),
        ...(content.includes(ANALYSIS_START) ? ['analysis'] : []),
        ...(content.includes(OUTPUT_START) ? ['output'] : []),
        ...(content.includes(INSTRUCTIONS_START) ? ['instructions'] : []),
      ];
      const truncatedSections = sections.slice(sections.indexOf(truncatedAt));

      const truncatedLength = content.length - contentTruncated.length;
      let truncatedContent = contentTruncated;
      if (truncatedAt) {
        truncatedContent += `...\n</${truncatedAt}>`;
      }
      truncatedContent += `\n\nThe operation summary has had <${truncatedSections.join('>, <')}> truncated for length (${truncatedLength} characters not shown). To get the full summary call 'getOperationOutput(${messageTimestamp}, ${operationIndex})'`;

      return { type, content: truncatedContent };
    }
    
    return { type, content };
  }
  
  // Handle image content
  if (content.startsWith('http://') || content.startsWith('https://')) {
    return { type, content: new URL(content) };
  }

  // Handle file content
  const file = unlinkFile(content);
  if (file) {
    const fileBuffer = await fs.promises.readFile(file.filepath);
    const fileBase64 = fileBuffer.toString("base64");
    const fileMimeType = await detectMimeType(file.filepath, file.filename);

    return { type, content: `data:${fileMimeType};base64,${fileBase64}` };
  }

  return { type, content };
}

/**
 * Converts a file link into a file filepath & filename.
 * 
 * @param link 
 * @returns 
 */
export function unlinkFile(link: string): { filename: string; filepath: string} | null {
  const [_, filename, filepath] = link.match(/^\[([^\]]+)\]\(([^)]+)\)$/) || [];
  return filename && filepath ? { filename, filepath } : null;
}

/**
 * Converts a filepath into a markdown-style file link.
 * 
 * @param filepath - The full path to the file.
 * @param filename - The name of the file to display (defaults to the base name of the filepath).
 * @returns 
 */
export function linkFile(filepath: string, filename: string = path.basename(filepath)): string {
  return `[${filename}](${fileProtocol(filepath)})`;
}

/**
 * Ensures a path is in file protocol format.
 * 
 * @param path 
 * @returns 
 */
export function fileProtocol(path: string): string {
  path = path.replace(/\\/g, '/');
  if (!path.startsWith('file:///')) {
    if (path.startsWith('/')) {
      path = `file://${path}`;
    } else {
      path = `file:///${path}`;
    }
  }
  return path;
}