import { JsonFile, getDataPath } from './file-manager.js';
import { DataFileSchema, type DataFile, type DataRecord } from './schemas.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Data file manager for custom user-defined types
 */
export class DataManager extends JsonFile<DataFile> {
  constructor(private typeName: string) {
    const initialData: DataFile = {
      updated: Date.now(),
      data: [],
    };

    super(getDataPath(typeName), initialData);
  }

  protected validate(parsed: any): DataFile {
    return DataFileSchema.parse(parsed);
  }

  protected getUpdatedTimestamp(data: any): number {
    return data.updated;
  }

  protected setUpdatedTimestamp(data: DataFile, timestamp: number): void {
    data.updated = timestamp;
  }

  /**
   * Create a new data item
   */
  async create(fields: Record<string, any>): Promise<string> {
    const id = uuidv4();
    const now = Date.now();
    await this.save((dataFile) => {
      dataFile.data.push({
        id,
        created: now,
        updated: now,
        fields,
      });
    });
    return id;
  }

  /**
   * Get all data items
   */
  getAll(): DataRecord[] {
    return this.data.data;
  }

  /**
   * Get a data item by ID
   */
  getById(id: string): DataRecord | undefined {
    return this.data.data.find((item) => item.id === id);
  }

  /**
   * Update a data item by ID
   */
  async update(id: string, fieldUpdates: Record<string, any>): Promise<void> {
    await this.save((dataFile) => {
      const item = dataFile.data.find((item) => item.id === id);
      if (!item) {
        throw new Error(`Item with ID ${id} not found in ${this.typeName}`);
      }
      Object.assign(item.fields, fieldUpdates);
      item.updated = Date.now();
    });
  }

  /**
   * Delete a data item by ID
   */
  async delete(id: string): Promise<void> {
    await this.save((dataFile) => {
      const index = dataFile.data.findIndex((item) => item.id === id);
      if (index === -1) {
        throw new Error(`Item with ID ${id} not found in ${this.typeName}`);
      }
      dataFile.data.splice(index, 1);
    });
  }

  /**
   * Search data items by field values
   */
  search(criteria: Record<string, any>): DataRecord[] {
    return this.data.data.filter((item) => {
      return Object.entries(criteria).every(([key, value]) => {
        return item.fields[key] === value;
      });
    });
  }

  /**
   * Get the type name
   */
  getTypeName(): string {
    return this.typeName;
  }
}
