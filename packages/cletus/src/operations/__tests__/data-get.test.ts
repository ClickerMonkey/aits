import { describe, it, expect, beforeEach } from '@jest/globals';
import { DataRecord } from '../../schemas';

/**
 * Mock implementation of DataManager for testing data_get operation
 */
class MockDataManager {
  private data: { updated: number; data: DataRecord[] };
  private loaded: boolean = false;

  constructor(private typeName: string, initialRecords: DataRecord[] = []) {
    this.data = {
      updated: Date.now(),
      data: initialRecords,
    };
  }

  async load(): Promise<void> {
    this.loaded = true;
  }

  getAll(): DataRecord[] {
    return this.data.data;
  }

  addRecord(record: DataRecord): void {
    this.data.data.push(record);
  }

  getTypeName(): string {
    return this.typeName;
  }
}

/**
 * Helper function to create a test record
 */
function createTestRecord(id: string, fields: Record<string, any>): DataRecord {
  const now = Date.now();
  return {
    id,
    created: now,
    updated: now,
    fields,
  };
}

/**
 * Simple implementation of data_get logic for testing
 * This mirrors the actual implementation in operations/dba.tsx
 */
async function dataGetLogic(
  manager: MockDataManager,
  offset: number = 0,
  limit: number = 10
): Promise<{ records: Array<{ id: string; created: number; updated: number; fields: Record<string, any> }>; total: number }> {
  await manager.load();
  const allRecords = manager.getAll();
  const total = allRecords.length;
  const records = allRecords.slice(offset, offset + limit).map((record) => ({
    id: record.id,
    created: record.created,
    updated: record.updated,
    fields: record.fields,
  }));
  return { records, total };
}

describe('data_get operation', () => {
  let manager: MockDataManager;

  beforeEach(() => {
    manager = new MockDataManager('testType');
  });

  describe('empty data', () => {
    it('should return empty records and zero total for empty data', async () => {
      const result = await dataGetLogic(manager);
      expect(result.records).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('pagination', () => {
    beforeEach(() => {
      // Add 25 test records
      for (let i = 0; i < 25; i++) {
        manager.addRecord(createTestRecord(`id-${i}`, { name: `Record ${i}`, index: i }));
      }
    });

    it('should return first 10 records by default', async () => {
      const result = await dataGetLogic(manager);
      expect(result.records.length).toBe(10);
      expect(result.total).toBe(25);
      expect(result.records[0].fields.index).toBe(0);
      expect(result.records[9].fields.index).toBe(9);
    });

    it('should respect custom limit', async () => {
      const result = await dataGetLogic(manager, 0, 5);
      expect(result.records.length).toBe(5);
      expect(result.total).toBe(25);
      expect(result.records[0].fields.index).toBe(0);
      expect(result.records[4].fields.index).toBe(4);
    });

    it('should respect custom offset', async () => {
      const result = await dataGetLogic(manager, 10, 10);
      expect(result.records.length).toBe(10);
      expect(result.total).toBe(25);
      expect(result.records[0].fields.index).toBe(10);
      expect(result.records[9].fields.index).toBe(19);
    });

    it('should return remaining records when offset + limit exceeds total', async () => {
      const result = await dataGetLogic(manager, 20, 10);
      expect(result.records.length).toBe(5);
      expect(result.total).toBe(25);
      expect(result.records[0].fields.index).toBe(20);
      expect(result.records[4].fields.index).toBe(24);
    });

    it('should return empty records when offset exceeds total', async () => {
      const result = await dataGetLogic(manager, 30, 10);
      expect(result.records).toEqual([]);
      expect(result.total).toBe(25);
    });

    it('should handle zero limit', async () => {
      const result = await dataGetLogic(manager, 0, 0);
      expect(result.records).toEqual([]);
      expect(result.total).toBe(25);
    });
  });

  describe('record structure', () => {
    it('should return records with correct structure', async () => {
      const now = Date.now();
      manager.addRecord({
        id: 'test-id',
        created: now,
        updated: now + 1000,
        fields: { name: 'Test', value: 42 },
      });

      const result = await dataGetLogic(manager);
      expect(result.records.length).toBe(1);
      expect(result.records[0]).toEqual({
        id: 'test-id',
        created: now,
        updated: now + 1000,
        fields: { name: 'Test', value: 42 },
      });
    });

    it('should handle complex field values', async () => {
      manager.addRecord(createTestRecord('complex-id', {
        string: 'text',
        number: 123,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        nested: { a: 1, b: 2 },
      }));

      const result = await dataGetLogic(manager);
      expect(result.records[0].fields).toEqual({
        string: 'text',
        number: 123,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        nested: { a: 1, b: 2 },
      });
    });
  });
});
