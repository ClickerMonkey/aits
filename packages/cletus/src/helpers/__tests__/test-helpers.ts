/**
 * Shared test utilities for DBA query tests
 */

import { IDataManager } from '../query';
import { DataRecord, DataFile, TypeDefinition } from '../../schemas';

/**
 * Mock implementation of IDataManager for testing
 */
export class MockDataManager implements IDataManager {
  private data: DataFile;
  private diskData: DataFile; // Simulates data on disk
  private loaded: boolean = false;

  constructor(private typeName: string, initialRecords: DataRecord[] = []) {
    this.diskData = {
      updated: Date.now(),
      data: initialRecords,
    };
    this.data = {
      updated: this.diskData.updated,
      data: [...this.diskData.data], // Copy for in-memory state
    };
  }

  async load(): Promise<void> {
    this.loaded = true;
    // Reload from "disk" - create a deep copy to simulate fresh load
    this.data = {
      updated: this.diskData.updated,
      data: this.diskData.data.map(r => ({
        ...r,
        fields: { ...r.fields },
      })),
    };
  }

  async save(fn: (dataFile: DataFile) => void | Promise<void>): Promise<void> {
    if (!this.loaded) {
      throw new Error('Must call load() before save()');
    }
    await fn(this.data);
    this.data.updated = Date.now();
    // Save to "disk" - persist the changes
    this.diskData = {
      updated: this.data.updated,
      data: this.data.data.map(r => ({
        ...r,
        fields: { ...r.fields },
      })),
    };
  }

  getAll(): DataRecord[] {
    return this.data.data;
  }

  // Test helper methods
  addRecord(record: DataRecord): void {
    this.diskData.data.push(record);
    this.data.data.push({ ...record, fields: { ...record.fields } });
  }

  getTypeName(): string {
    return this.typeName;
  }
}

/**
 * Test context for managing types and data managers
 */
export class TestContext {
  private types: TypeDefinition[] = [];
  private managers: Map<string, MockDataManager> = new Map();

  addType(type: TypeDefinition): void {
    this.types.push(type);
    if (!this.managers.has(type.name)) {
      this.managers.set(type.name, new MockDataManager(type.name));
    }
  }

  getTypes = (): TypeDefinition[] => {
    return this.types;
  };

  getManager = (typeName: string): IDataManager => {
    let manager = this.managers.get(typeName);
    if (!manager) {
      manager = new MockDataManager(typeName);
      this.managers.set(typeName, manager);
    }
    return manager;
  };

  getMockManager(typeName: string): MockDataManager {
    return this.managers.get(typeName)!;
  }

  addRecord(typeName: string, record: DataRecord): void {
    const manager = this.getMockManager(typeName);
    if (manager) {
      manager.addRecord(record);
    }
  }
}
