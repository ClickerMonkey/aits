import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * Base class for managing JSON files with concurrent update protection
 */
export abstract class JsonFile<T> {
  protected data: T;
  protected lastUpdated: number;
  protected filePath: string;

  constructor(filePath: string, initialData: T) {
    this.filePath = filePath;
    this.data = initialData;
    this.lastUpdated = Date.now();
  }

  /**
   * Load the file from disk
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(content);

      // Validate with schema (implemented by subclass)
      this.data = this.validate(parsed);
      this.lastUpdated = this.getUpdatedTimestamp(this.data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, use initial data
        return;
      }
      throw new Error(`Failed to load ${this.filePath}: ${error.message}`);
    }
  }

  /**
   * Save changes to the file with concurrent update protection
   */
  async save(modifier: (current: T) => void | Promise<void>): Promise<void> {
    // Read current file state
    let fileData: any;
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      fileData = JSON.parse(content);

      // Check for concurrent updates
      const fileTimestamp = this.getUpdatedTimestamp(fileData);
      if (fileTimestamp !== this.lastUpdated) {
        throw new Error(
          `Concurrent update detected for ${this.filePath}. ` +
          `File was modified by another process.`
        );
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist yet, this is fine for first save
    }

    // Apply modifications
    await modifier(this.data);

    // Update timestamp
    const newTimestamp = Date.now();
    this.setUpdatedTimestamp(this.data, newTimestamp);
    this.lastUpdated = newTimestamp;

    // Ensure directory exists
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    // Write to disk
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  /**
   * Get the current data (read-only)
   */
  getData(): Readonly<T> {
    return this.data;
  }

  /**
   * Validate the parsed JSON (implemented by subclass)
   */
  protected abstract validate(parsed: any): T;

  /**
   * Get the updated timestamp from data
   */
  protected abstract getUpdatedTimestamp(data: any): number;

  /**
   * Set the updated timestamp on data
   */
  protected abstract setUpdatedTimestamp(data: T, timestamp: number): void;
}

/**
 * Get the Cletus home directory
 */
export function getCletusHome(): string {
  return path.join(os.homedir(), '.cletus');
}

/**
 * Get path to config file
 */
export function getConfigPath(): string {
  return path.join(getCletusHome(), 'config.json');
}

/**
 * Get path to knowledge file
 */
export function getKnowledgePath(): string {
  return path.join(getCletusHome(), 'knowledge.json');
}

/**
 * Get path to chat messages file
 */
export function getChatPath(chatId: string): string {
  return path.join(getCletusHome(), 'chats', `${chatId}.json`);
}

/**
 * Get path to data file
 */
export function getDataPath(typeName: string): string {
  return path.join(getCletusHome(), 'data', `${typeName}.json`);
}

/**
 * Get path to config file
 */
export async function getAssetPath(createIfNotExists: boolean = false): Promise<string> {
  const fullPath = path.join(getCletusHome(), 'assets');
  if (createIfNotExists) {
    await fs.mkdir(fullPath, { recursive: true });
  }
  return fullPath;
}

/**
 * Get path to images directory for generated images
 */
export async function getImagePath(createIfNotExists: boolean = false): Promise<string> {
  const fullPath = path.join(getCletusHome(), 'images');
  if (createIfNotExists) {
    await fs.mkdir(fullPath, { recursive: true })
  }
  return fullPath;
}

/**
 * Check if config exists
 */
export async function configExists(): Promise<boolean> {
  try {
    await fs.access(getConfigPath());
    return true;
  } catch {
    return false;
  }
}
