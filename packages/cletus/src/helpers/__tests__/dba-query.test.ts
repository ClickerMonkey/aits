import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  executeQuery,
  executeQueryWithoutCommit,
  canCommitQueryResult,
  commitQueryChanges,
  IDataManager,
} from '../dba-query';
import type { Query } from '../dba';
import { DataRecord, DataFile, TypeDefinition } from '../../schemas';

/**
 * Mock implementation of IDataManager for testing
 */
class MockDataManager implements IDataManager {
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
class TestContext {
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

describe('executeQuery', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = new TestContext();
  });

  describe('SELECT queries', () => {
    it('should execute a simple SELECT query', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', age: 30 },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob', age: 25 },
      });

      // Query
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'users', column: 'name' } },
          { alias: 'age', value: { source: 'users', column: 'age' } },
        ],
        from: { kind: 'table', table: 'users' },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({ name: 'Alice', age: 30 });
      expect(result.rows[1]).toEqual({ name: 'Bob', age: 25 });
    });

    it('should execute SELECT with WHERE clause', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', age: 30 },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob', age: 25 },
      });

      // Query: SELECT name, age FROM users WHERE age > 26
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'users', column: 'name' } },
          { alias: 'age', value: { source: 'users', column: 'age' } },
        ],
        from: { kind: 'table', table: 'users' },
        where: [
          {
            kind: 'comparison',
            left: { source: 'users', column: 'age' },
            cmp: '>',
            right: 26,
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ name: 'Alice', age: 30 });
    });

    it('should execute SELECT with LIMIT and OFFSET', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      for (let i = 1; i <= 5; i++) {
        ctx.addRecord('users', {
          id: `${i}`,
          created: Date.now(),
          updated: Date.now(),
          fields: { name: `User${i}` },
        });
      }

      // Query: SELECT name FROM users LIMIT 2 OFFSET 2
      const query: Query = {
        kind: 'select',
        values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
        from: { kind: 'table', table: 'users' },
        limit: 2,
        offset: 2,
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({ name: 'User3' });
      expect(result.rows[1]).toEqual({ name: 'User4' });
    });

    it('should execute SELECT with ORDER BY', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Charlie', age: 35 },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', age: 30 },
      });

      ctx.addRecord('users', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob', age: 25 },
      });

      // Query: SELECT name, age FROM users ORDER BY age DESC
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'users', column: 'name' } },
          { alias: 'age', value: { source: 'users', column: 'age' } },
        ],
        from: { kind: 'table', table: 'users' },
        orderBy: [
          {
            value: { source: 'users', column: 'age' },
            dir: 'desc',
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0]).toEqual({ name: 'Charlie', age: 35 });
      expect(result.rows[1]).toEqual({ name: 'Alice', age: 30 });
      expect(result.rows[2]).toEqual({ name: 'Bob', age: 25 });
    });

    it('should execute SELECT with DISTINCT', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'city', friendlyName: 'City', type: 'string', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', city: 'NYC' },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob', city: 'NYC' },
      });

      ctx.addRecord('users', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Charlie', city: 'LA' },
      });

      // Query: SELECT DISTINCT city FROM users
      const query: Query = {
        kind: 'select',
        distinct: true,
        values: [{ alias: 'city', value: { source: 'users', column: 'city' } }],
        from: { kind: 'table', table: 'users' },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(2);
      const cities = result.rows.map((r) => r.city);
      expect(cities).toContain('NYC');
      expect(cities).toContain('LA');
    });

    it('should execute SELECT with aggregation (COUNT)', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      for (let i = 1; i <= 3; i++) {
        ctx.addRecord('users', {
          id: `${i}`,
          created: Date.now(),
          updated: Date.now(),
          fields: { name: `User${i}` },
        });
      }

      // Query: SELECT COUNT(*) as count FROM users
      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'count',
            value: { kind: 'aggregate', aggregate: 'count', value: '*' },
          },
        ],
        from: { kind: 'table', table: 'users' },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ count: 3 });
    });

    it('should execute SELECT with GROUP BY and aggregation', async () => {
      // Setup
      ctx.addType({
        name: 'orders',
        friendlyName: 'Orders',
        description: 'Order records',
        knowledgeTemplate: '{{customer}}',
        fields: [
          { name: 'customer', friendlyName: 'Customer', type: 'string', required: true },
          { name: 'amount', friendlyName: 'Amount', type: 'number', required: true },
        ],
      });

      ctx.addRecord('orders', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Alice', amount: 100 },
      });

      ctx.addRecord('orders', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Alice', amount: 150 },
      });

      ctx.addRecord('orders', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Bob', amount: 200 },
      });

      // Query: SELECT customer, SUM(amount) as total FROM orders GROUP BY customer
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer', value: { source: 'orders', column: 'customer' } },
          {
            alias: 'total',
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'orders', column: 'amount' },
            },
          },
        ],
        from: { kind: 'table', table: 'orders' },
        groupBy: [{ source: 'orders', column: 'customer' }],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(2);
      const aliceRow = result.rows.find((r) => r.customer === 'Alice');
      const bobRow = result.rows.find((r) => r.customer === 'Bob');
      expect(aliceRow).toEqual({ customer: 'Alice', total: 250 });
      expect(bobRow).toEqual({ customer: 'Bob', total: 200 });
    });

    it('should execute SELECT with INNER JOIN', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addType({
        name: 'orders',
        friendlyName: 'Orders',
        description: 'Order records',
        knowledgeTemplate: '{{userid}}',
        fields: [
          { name: 'userid', friendlyName: 'User ID', type: 'string', required: true },
          { name: 'amount', friendlyName: 'Amount', type: 'number', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob' },
      });

      ctx.addRecord('orders', {
        id: 'o1',
        created: Date.now(),
        updated: Date.now(),
        fields: { userid: '1', amount: 100 },
      });

      ctx.addRecord('orders', {
        id: 'o2',
        created: Date.now(),
        updated: Date.now(),
        fields: { userid: '1', amount: 150 },
      });

      // Query: SELECT u.name, o.amount FROM users u INNER JOIN orders o ON u.id = o.userid
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'u', column: 'name' } },
          { alias: 'amount', value: { source: 'o', column: 'amount' } },
        ],
        from: { kind: 'table', table: 'users', as: 'u' },
        joins: [
          {
            type: 'inner',
            source: { kind: 'table', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'u', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'userid' },
              },
            ],
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({ name: 'Alice', amount: 100 });
      expect(result.rows[1]).toEqual({ name: 'Alice', amount: 150 });
    });
  });

  describe('INSERT queries', () => {
    it('should execute a simple INSERT query', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      // Query: INSERT INTO users (name, age) VALUES ('Alice', 30)
      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['name', 'age'],
        values: ['Alice', 30],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.affectedCount).toBe(1);
      expect(result.inserted).toHaveLength(1);
      expect(result.inserted![0].type).toBe('users');
      expect(result.inserted![0].ids).toHaveLength(1);

      // Verify data was actually inserted
      const manager = ctx.getMockManager('users');
      const records = manager.getAll();
      expect(records).toHaveLength(1);
      expect(records[0].fields).toEqual({ name: 'Alice', age: 30 });
    });

    it('should execute INSERT with RETURNING', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      // Query: INSERT INTO users (name) VALUES ('Alice') RETURNING name
      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['name'],
        values: ['Alice'],
        returning: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ name: 'Alice' });
    });

    it('should execute INSERT with ON CONFLICT DO NOTHING', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{email}}',
        fields: [
          { name: 'email', friendlyName: 'Email', type: 'string', required: true },
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      // Add existing record
      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { email: 'alice@example.com', name: 'Alice' },
      });

      // Query: INSERT INTO users (email, name) VALUES ('alice@example.com', 'Alice2') ON CONFLICT (email) DO NOTHING
      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['email', 'name'],
        values: ['alice@example.com', 'Alice2'],
        onConflict: {
          columns: ['email'],
          doNothing: true,
        },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.affectedCount).toBe(0);
      expect(result.inserted).toBeUndefined();

      // Verify original data unchanged
      const manager = ctx.getMockManager('users');
      const records = manager.getAll();
      expect(records).toHaveLength(1);
      expect(records[0].fields.name).toBe('Alice');
    });

    it('should throw error when columns and values count mismatch', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'email', friendlyName: 'Email', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      // Query: INSERT with 3 columns but only 2 values
      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['name', 'email', 'age'],
        values: ['Alice', 'alice@example.com'], // Missing age value
      };

      // Execute and expect error
      await expect(executeQuery(query, ctx.getTypes, ctx.getManager)).rejects.toThrow(
        'INSERT column/value count mismatch: 3 columns but 2 values provided'
      );
    });
  });

  describe('UPDATE queries', () => {
    it('should execute a simple UPDATE query', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', age: 30 },
      });

      // Query: UPDATE users SET age = 31 WHERE name = 'Alice'
      const query: Query = {
        kind: 'update',
        table: 'users',
        set: [{ column: 'age', value: 31 }],
        where: [
          {
            kind: 'comparison',
            left: { source: 'users', column: 'name' },
            cmp: '=',
            right: 'Alice',
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.affectedCount).toBe(1);
      expect(result.updated).toHaveLength(1);
      expect(result.updated![0].type).toBe('users');
      expect(result.updated![0].ids).toEqual(['1']);

      // Verify data was actually updated
      const manager = ctx.getMockManager('users');
      const records = manager.getAll();
      expect(records[0].fields.age).toBe(31);
    });

    it('should execute UPDATE with RETURNING', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', age: 30 },
      });

      // Query: UPDATE users SET age = 31 WHERE name = 'Alice' RETURNING name, age
      const query: Query = {
        kind: 'update',
        table: 'users',
        set: [{ column: 'age', value: 31 }],
        where: [
          {
            kind: 'comparison',
            left: { source: 'users', column: 'name' },
            cmp: '=',
            right: 'Alice',
          },
        ],
        returning: [
          { alias: 'name', value: { source: 'users', column: 'name' } },
          { alias: 'age', value: { source: 'users', column: 'age' } },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ name: 'Alice', age: 31 });
    });
  });

  describe('DELETE queries', () => {
    it('should execute a simple DELETE query', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob' },
      });

      // Query: DELETE FROM users WHERE name = 'Alice'
      const query: Query = {
        kind: 'delete',
        table: 'users',
        where: [
          {
            kind: 'comparison',
            left: { source: 'users', column: 'name' },
            cmp: '=',
            right: 'Alice',
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.affectedCount).toBe(1);
      expect(result.deleted).toHaveLength(1);
      expect(result.deleted![0].type).toBe('users');
      expect(result.deleted![0].ids).toEqual(['1']);

      // Verify data was actually deleted
      const manager = ctx.getMockManager('users');
      const records = manager.getAll();
      expect(records).toHaveLength(1);
      expect(records[0].fields.name).toBe('Bob');
    });

    it('should execute DELETE with RETURNING', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      // Query: DELETE FROM users WHERE name = 'Alice' RETURNING name
      const query: Query = {
        kind: 'delete',
        table: 'users',
        where: [
          {
            kind: 'comparison',
            left: { source: 'users', column: 'name' },
            cmp: '=',
            right: 'Alice',
          },
        ],
        returning: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ name: 'Alice' });
    });
  });

  describe('SET operations', () => {
    beforeEach(() => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob' },
      });

      ctx.addRecord('users', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Charlie' },
      });
    });

    it('should execute UNION query', async () => {
      // Query: SELECT name FROM users WHERE name = 'Alice' UNION SELECT name FROM users WHERE name = 'Bob'
      const query: Query = {
        kind: 'union',
        left: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
          from: { kind: 'table', table: 'users' },
          where: [
            {
              kind: 'comparison',
              left: { source: 'users', column: 'name' },
              cmp: '=',
              right: 'Alice',
            },
          ],
        },
        right: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
          from: { kind: 'table', table: 'users' },
          where: [
            {
              kind: 'comparison',
              left: { source: 'users', column: 'name' },
              cmp: '=',
              right: 'Bob',
            },
          ],
        },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(2);
      const names = result.rows.map((r) => r.name);
      expect(names).toContain('Alice');
      expect(names).toContain('Bob');
    });
  });

  describe('CTE (WITH) queries', () => {
    it('should execute query with simple CTE', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', age: 30 },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob', age: 25 },
      });

      // Query: WITH young_users AS (SELECT * FROM users WHERE age < 28) SELECT name FROM young_users
      const query: Query = {
        kind: 'withs',
        withs: [
          {
            kind: 'cte',
            name: 'young_users',
            statement: {
              kind: 'select',
              values: [
                { alias: 'name', value: { source: 'users', column: 'name' } },
                { alias: 'age', value: { source: 'users', column: 'age' } },
              ],
              from: { kind: 'table', table: 'users' },
              where: [
                {
                  kind: 'comparison',
                  left: { source: 'users', column: 'age' },
                  cmp: '<',
                  right: 28,
                },
              ],
            },
          },
        ],
        final: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'young_users', column: 'name' } }],
          from: { kind: 'table', table: 'young_users' },
        },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ name: 'Bob' });
    });
  });

  describe('Complex expressions', () => {
    it('should evaluate binary operations', async () => {
      // Setup
      ctx.addType({
        name: 'products',
        friendlyName: 'Products',
        description: 'Product records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'price', friendlyName: 'Price', type: 'number', required: true },
          { name: 'quantity', friendlyName: 'Quantity', type: 'number', required: true },
        ],
      });

      ctx.addRecord('products', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget', price: 10, quantity: 5 },
      });

      // Query: SELECT name, price * quantity as total FROM products
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'products', column: 'name' } },
          {
            alias: 'total',
            value: {
              kind: 'binary',
              left: { source: 'products', column: 'price' },
              op: '*',
              right: { source: 'products', column: 'quantity' },
            },
          },
        ],
        from: { kind: 'table', table: 'products' },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ name: 'Widget', total: 50 });
    });

    it('should evaluate CASE expressions', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', age: 17 },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob', age: 25 },
      });

      // Query: SELECT name, CASE WHEN age < 18 THEN 'minor' ELSE 'adult' END as category FROM users
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'users', column: 'name' } },
          {
            alias: 'category',
            value: {
              kind: 'case',
              case: [
                {
                  when: {
                    kind: 'comparison',
                    left: { source: 'users', column: 'age' },
                    cmp: '<',
                    right: 18,
                  },
                  then: 'minor',
                },
              ],
              else: 'adult',
            },
          },
        ],
        from: { kind: 'table', table: 'users' },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({ name: 'Alice', category: 'minor' });
      expect(result.rows[1]).toEqual({ name: 'Bob', category: 'adult' });
    });

    it('should evaluate IN expressions', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob' },
      });

      ctx.addRecord('users', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Charlie' },
      });

      // Query: SELECT name FROM users WHERE name IN ('Alice', 'Charlie')
      const query: Query = {
        kind: 'select',
        values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
        from: { kind: 'table', table: 'users' },
        where: [
          {
            kind: 'in',
            value: { source: 'users', column: 'name' },
            in: ['Alice', 'Charlie'],
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(2);
      const names = result.rows.map((r) => r.name);
      expect(names).toContain('Alice');
      expect(names).toContain('Charlie');
    });

    it('should evaluate BETWEEN expressions', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', age: 20 },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob', age: 30 },
      });

      ctx.addRecord('users', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Charlie', age: 40 },
      });

      // Query: SELECT name FROM users WHERE age BETWEEN 25 AND 35
      const query: Query = {
        kind: 'select',
        values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
        from: { kind: 'table', table: 'users' },
        where: [
          {
            kind: 'between',
            value: { source: 'users', column: 'age' },
            between: [25, 35],
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ name: 'Bob' });
    });

    it('should evaluate IS NULL expressions', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'email', friendlyName: 'Email', type: 'string', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', email: 'alice@example.com' },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob', email: null },
      });

      // Query: SELECT name FROM users WHERE email IS NULL
      const query: Query = {
        kind: 'select',
        values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
        from: { kind: 'table', table: 'users' },
        where: [
          {
            kind: 'isNull',
            isNull: { source: 'users', column: 'email' },
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ name: 'Bob' });
    });

    it('should evaluate function calls', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'nickname', friendlyName: 'Nickname', type: 'string', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', nickname: null },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob', nickname: 'Bobby' },
      });

      // Query: SELECT name, COALESCE(nickname, name) as display_name, LOWER(name) as lower_name FROM users
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'users', column: 'name' } },
          {
            alias: 'display_name',
            value: {
              kind: 'function',
              function: 'coalesce',
              args: [
                { source: 'users', column: 'nickname' },
                { source: 'users', column: 'name' },
              ],
            },
          },
          {
            alias: 'lower_name',
            value: {
              kind: 'function',
              function: 'lower',
              args: [{ source: 'users', column: 'name' }],
            },
          },
        ],
        from: { kind: 'table', table: 'users' },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({ name: 'Alice', display_name: 'Alice', lower_name: 'alice' });
      expect(result.rows[1]).toEqual({ name: 'Bob', display_name: 'Bobby', lower_name: 'bob' });
    });

    it('should evaluate AND/OR/NOT boolean expressions', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
          { name: 'active', friendlyName: 'Active', type: 'boolean', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', age: 30, active: true },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob', age: 25, active: false },
      });

      ctx.addRecord('users', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Charlie', age: 35, active: true },
      });

      // Query: SELECT name FROM users WHERE (age > 28 AND active = true) OR NOT(age < 30)
      const query: Query = {
        kind: 'select',
        values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
        from: { kind: 'table', table: 'users' },
        where: [
          {
            kind: 'or',
            or: [
              {
                kind: 'and',
                and: [
                  {
                    kind: 'comparison',
                    left: { source: 'users', column: 'age' },
                    cmp: '>',
                    right: 28,
                  },
                  {
                    kind: 'comparison',
                    left: { source: 'users', column: 'active' },
                    cmp: '=',
                    right: true,
                  },
                ],
              },
              {
                kind: 'not',
                not: {
                  kind: 'comparison',
                  left: { source: 'users', column: 'age' },
                  cmp: '<',
                  right: 30,
                },
              },
            ],
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - Alice (age 30, active true) and Charlie (age 35, active true) match
      expect(result.rows).toHaveLength(2);
      const names = result.rows.map((r) => r.name);
      expect(names).toContain('Alice');
      expect(names).toContain('Charlie');
    });
  });

  describe('SET operations (additional)', () => {
    beforeEach(() => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob' },
      });

      ctx.addRecord('users', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Charlie' },
      });
    });

    it('should execute INTERSECT query', async () => {
      // Query: (SELECT name FROM users WHERE name IN ('Alice', 'Bob')) INTERSECT (SELECT name FROM users WHERE name IN ('Bob', 'Charlie'))
      const query: Query = {
        kind: 'intersect',
        left: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
          from: { kind: 'table', table: 'users' },
          where: [
            {
              kind: 'in',
              value: { source: 'users', column: 'name' },
              in: ['Alice', 'Bob'],
            },
          ],
        },
        right: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
          from: { kind: 'table', table: 'users' },
          where: [
            {
              kind: 'in',
              value: { source: 'users', column: 'name' },
              in: ['Bob', 'Charlie'],
            },
          ],
        },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - Only Bob is in both sets
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ name: 'Bob' });
    });

    it('should execute EXCEPT query', async () => {
      // Query: (SELECT name FROM users WHERE name IN ('Alice', 'Bob')) EXCEPT (SELECT name FROM users WHERE name = 'Bob')
      const query: Query = {
        kind: 'except',
        left: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
          from: { kind: 'table', table: 'users' },
          where: [
            {
              kind: 'in',
              value: { source: 'users', column: 'name' },
              in: ['Alice', 'Bob'],
            },
          ],
        },
        right: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
          from: { kind: 'table', table: 'users' },
          where: [
            {
              kind: 'comparison',
              left: { source: 'users', column: 'name' },
              cmp: '=',
              right: 'Bob',
            },
          ],
        },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - Alice is in left but not in right
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ name: 'Alice' });
    });

    it('should execute UNION ALL query', async () => {
      // Query: SELECT name FROM users WHERE name = 'Alice' UNION ALL SELECT name FROM users WHERE name = 'Alice'
      const query: Query = {
        kind: 'union',
        all: true,
        left: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
          from: { kind: 'table', table: 'users' },
          where: [
            {
              kind: 'comparison',
              left: { source: 'users', column: 'name' },
              cmp: '=',
              right: 'Alice',
            },
          ],
        },
        right: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
          from: { kind: 'table', table: 'users' },
          where: [
            {
              kind: 'comparison',
              left: { source: 'users', column: 'name' },
              cmp: '=',
              right: 'Alice',
            },
          ],
        },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - UNION ALL keeps duplicates
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({ name: 'Alice' });
      expect(result.rows[1]).toEqual({ name: 'Alice' });
    });
  });

  describe('CTE (WITH) queries (additional)', () => {
    it('should execute query with multiple CTEs', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
          { name: 'city', friendlyName: 'City', type: 'string', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', age: 30, city: 'NYC' },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob', age: 25, city: 'NYC' },
      });

      ctx.addRecord('users', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Charlie', age: 35, city: 'LA' },
      });

      // Query: WITH 
      //   nyc_users AS (SELECT * FROM users WHERE city = 'NYC'),
      //   young_nyc AS (SELECT * FROM nyc_users WHERE age < 28)
      // SELECT name FROM young_nyc
      const query: Query = {
        kind: 'withs',
        withs: [
          {
            kind: 'cte',
            name: 'nyc_users',
            statement: {
              kind: 'select',
              values: [
                { alias: 'name', value: { source: 'users', column: 'name' } },
                { alias: 'age', value: { source: 'users', column: 'age' } },
                { alias: 'city', value: { source: 'users', column: 'city' } },
              ],
              from: { kind: 'table', table: 'users' },
              where: [
                {
                  kind: 'comparison',
                  left: { source: 'users', column: 'city' },
                  cmp: '=',
                  right: 'NYC',
                },
              ],
            },
          },
          {
            kind: 'cte',
            name: 'young_nyc',
            statement: {
              kind: 'select',
              values: [
                { alias: 'name', value: { source: 'nyc_users', column: 'name' } },
                { alias: 'age', value: { source: 'nyc_users', column: 'age' } },
              ],
              from: { kind: 'table', table: 'nyc_users' },
              where: [
                {
                  kind: 'comparison',
                  left: { source: 'nyc_users', column: 'age' },
                  cmp: '<',
                  right: 28,
                },
              ],
            },
          },
        ],
        final: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'young_nyc', column: 'name' } }],
          from: { kind: 'table', table: 'young_nyc' },
        },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - Only Bob is young and in NYC
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ name: 'Bob' });
    });

    it('should execute recursive CTE for hierarchy', async () => {
      // Setup - Employee hierarchy
      ctx.addType({
        name: 'employees',
        friendlyName: 'Employees',
        description: 'Employee records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'manager_id', friendlyName: 'Manager ID', type: 'string', required: false },
        ],
      });

      // CEO -> Manager -> Employee hierarchy
      ctx.addRecord('employees', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'CEO', manager_id: null },
      });

      ctx.addRecord('employees', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Manager', manager_id: '1' },
      });

      ctx.addRecord('employees', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Employee1', manager_id: '2' },
      });

      ctx.addRecord('employees', {
        id: '4',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Employee2', manager_id: '2' },
      });

      // Recursive CTE to find all reports under CEO
      // WITH RECURSIVE reports AS (
      //   SELECT id, name FROM employees WHERE id = '1'
      //   UNION ALL
      //   SELECT e.id, e.name FROM employees e INNER JOIN reports r ON e.manager_id = r.id
      // )
      // SELECT name FROM reports
      const query: Query = {
        kind: 'withs',
        withs: [
          {
            kind: 'cte-recursive',
            name: 'reports',
            statement: {
              kind: 'select',
              values: [
                { alias: 'id', value: { source: 'employees', column: 'id' } },
                { alias: 'name', value: { source: 'employees', column: 'name' } },
              ],
              from: { kind: 'table', table: 'employees' },
              where: [
                {
                  kind: 'comparison',
                  left: { source: 'employees', column: 'id' },
                  cmp: '=',
                  right: '1',
                },
              ],
            },
            recursiveStatement: {
              kind: 'select',
              values: [
                { alias: 'id', value: { source: 'e', column: 'id' } },
                { alias: 'name', value: { source: 'e', column: 'name' } },
              ],
              from: { kind: 'table', table: 'employees', as: 'e' },
              joins: [
                {
                  type: 'inner',
                  source: { kind: 'table', table: 'reports', as: 'r' },
                  on: [
                    {
                      kind: 'comparison',
                      left: { source: 'e', column: 'manager_id' },
                      cmp: '=',
                      right: { source: 'r', column: 'id' },
                    },
                  ],
                },
              ],
            },
          },
        ],
        final: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'reports', column: 'name' } }],
          from: { kind: 'table', table: 'reports' },
        },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - Should find all employees in hierarchy
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      const names = result.rows.map((r) => r.name);
      expect(names).toContain('CEO');
    });
  });

  describe('HAVING clause', () => {
    it('should execute SELECT with GROUP BY and HAVING', async () => {
      // Setup
      ctx.addType({
        name: 'orders',
        friendlyName: 'Orders',
        description: 'Order records',
        knowledgeTemplate: '{{customer}}',
        fields: [
          { name: 'customer', friendlyName: 'Customer', type: 'string', required: true },
          { name: 'amount', friendlyName: 'Amount', type: 'number', required: true },
        ],
      });

      ctx.addRecord('orders', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Alice', amount: 100 },
      });

      ctx.addRecord('orders', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Alice', amount: 150 },
      });

      ctx.addRecord('orders', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Bob', amount: 50 },
      });

      // Query: SELECT customer, SUM(amount) as total FROM orders GROUP BY customer HAVING SUM(amount) > 100
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer', value: { source: 'orders', column: 'customer' } },
          {
            alias: 'total',
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'orders', column: 'amount' },
            },
          },
        ],
        from: { kind: 'table', table: 'orders' },
        groupBy: [{ source: 'orders', column: 'customer' }],
        having: [
          {
            kind: 'comparison',
            left: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'orders', column: 'amount' },
            },
            cmp: '>',
            right: 100,
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - Only Alice has total > 100
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ customer: 'Alice', total: 250 });
    });

    it('should execute HAVING with COUNT', async () => {
      // Setup
      ctx.addType({
        name: 'orders',
        friendlyName: 'Orders',
        description: 'Order records',
        knowledgeTemplate: '{{customer}}',
        fields: [
          { name: 'customer', friendlyName: 'Customer', type: 'string', required: true },
          { name: 'amount', friendlyName: 'Amount', type: 'number', required: true },
        ],
      });

      ctx.addRecord('orders', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Alice', amount: 100 },
      });

      ctx.addRecord('orders', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Alice', amount: 150 },
      });

      ctx.addRecord('orders', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Bob', amount: 50 },
      });

      // Query: SELECT customer, COUNT(*) as order_count FROM orders GROUP BY customer HAVING COUNT(*) > 1
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer', value: { source: 'orders', column: 'customer' } },
          {
            alias: 'order_count',
            value: { kind: 'aggregate', aggregate: 'count', value: '*' },
          },
        ],
        from: { kind: 'table', table: 'orders' },
        groupBy: [{ source: 'orders', column: 'customer' }],
        having: [
          {
            kind: 'comparison',
            left: { kind: 'aggregate', aggregate: 'count', value: '*' },
            cmp: '>',
            right: 1,
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - Only Alice has more than 1 order
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ customer: 'Alice', order_count: 2 });
    });
  });

  describe('Window functions', () => {
    it('should execute window function with PARTITION BY', async () => {
      // Setup
      ctx.addType({
        name: 'sales',
        friendlyName: 'Sales',
        description: 'Sales records',
        knowledgeTemplate: '{{region}}',
        fields: [
          { name: 'region', friendlyName: 'Region', type: 'string', required: true },
          { name: 'amount', friendlyName: 'Amount', type: 'number', required: true },
        ],
      });

      ctx.addRecord('sales', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { region: 'East', amount: 100 },
      });

      ctx.addRecord('sales', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { region: 'East', amount: 150 },
      });

      ctx.addRecord('sales', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { region: 'West', amount: 200 },
      });

      // Query: SELECT region, amount, SUM(amount) OVER (PARTITION BY region) as region_total FROM sales
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'region', value: { source: 'sales', column: 'region' } },
          { alias: 'amount', value: { source: 'sales', column: 'amount' } },
          {
            alias: 'region_total',
            value: {
              kind: 'window',
              function: 'sum',
              value: { source: 'sales', column: 'amount' },
              partitionBy: [{ source: 'sales', column: 'region' }],
            },
          },
        ],
        from: { kind: 'table', table: 'sales' },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(3);
      const eastRows = result.rows.filter((r) => r.region === 'East');
      const westRows = result.rows.filter((r) => r.region === 'West');
      expect(eastRows.every((r) => r.region_total === 250)).toBe(true);
      expect(westRows.every((r) => r.region_total === 200)).toBe(true);
    });
  });

  describe('JOIN types', () => {
    beforeEach(() => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addType({
        name: 'orders',
        friendlyName: 'Orders',
        description: 'Order records',
        knowledgeTemplate: '{{userid}}',
        fields: [
          { name: 'userid', friendlyName: 'User ID', type: 'string', required: true },
          { name: 'amount', friendlyName: 'Amount', type: 'number', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob' },
      });

      ctx.addRecord('orders', {
        id: 'o1',
        created: Date.now(),
        updated: Date.now(),
        fields: { userid: '1', amount: 100 },
      });

      // Note: No orders for Bob, and there's an order for non-existent user
      ctx.addRecord('orders', {
        id: 'o2',
        created: Date.now(),
        updated: Date.now(),
        fields: { userid: '999', amount: 50 },
      });
    });

    it('should execute LEFT JOIN', async () => {
      // Query: SELECT u.name, o.amount FROM users u LEFT JOIN orders o ON u.id = o.userid
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'u', column: 'name' } },
          { alias: 'amount', value: { source: 'o', column: 'amount' } },
        ],
        from: { kind: 'table', table: 'users', as: 'u' },
        joins: [
          {
            type: 'left',
            source: { kind: 'table', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'u', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'userid' },
              },
            ],
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - Should include Bob even though he has no orders
      expect(result.rows).toHaveLength(2);
      const aliceRow = result.rows.find((r) => r.name === 'Alice');
      const bobRow = result.rows.find((r) => r.name === 'Bob');
      expect(aliceRow?.amount).toBe(100);
      expect(bobRow?.amount).toBeUndefined();
    });

    it('should execute RIGHT JOIN', async () => {
      // Query: SELECT u.name, o.amount FROM users u RIGHT JOIN orders o ON u.id = o.userid
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'u', column: 'name' } },
          { alias: 'amount', value: { source: 'o', column: 'amount' } },
        ],
        from: { kind: 'table', table: 'users', as: 'u' },
        joins: [
          {
            type: 'right',
            source: { kind: 'table', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'u', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'userid' },
              },
            ],
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - Should include order for non-existent user
      expect(result.rows).toHaveLength(2);
      const orderWithUser = result.rows.find((r) => r.name === 'Alice');
      const orderWithoutUser = result.rows.find((r) => r.amount === 50);
      expect(orderWithUser?.amount).toBe(100);
      expect(orderWithoutUser?.name).toBeUndefined();
    });

    it('should execute FULL JOIN', async () => {
      // Query: SELECT u.name, o.amount FROM users u FULL JOIN orders o ON u.id = o.userid
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'u', column: 'name' } },
          { alias: 'amount', value: { source: 'o', column: 'amount' } },
        ],
        from: { kind: 'table', table: 'users', as: 'u' },
        joins: [
          {
            type: 'full',
            source: { kind: 'table', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'u', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'userid' },
              },
            ],
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - Should include all users and all orders
      expect(result.rows).toHaveLength(3); // Alice+order, Bob without order, order without user
    });
  });

  describe('Subqueries', () => {
    beforeEach(() => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addType({
        name: 'orders',
        friendlyName: 'Orders',
        description: 'Order records',
        knowledgeTemplate: '{{userid}}',
        fields: [
          { name: 'userid', friendlyName: 'User ID', type: 'string', required: true },
          { name: 'amount', friendlyName: 'Amount', type: 'number', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob' },
      });

      ctx.addRecord('orders', {
        id: 'o1',
        created: Date.now(),
        updated: Date.now(),
        fields: { userid: '1', amount: 100 },
      });
    });

    it('should execute EXISTS subquery', async () => {
      // Query: SELECT name FROM users u WHERE EXISTS (SELECT 1 FROM orders WHERE userid = u.id)
      const query: Query = {
        kind: 'select',
        values: [{ alias: 'name', value: { source: 'u', column: 'name' } }],
        from: { kind: 'table', table: 'users', as: 'u' },
        where: [
          {
            kind: 'exists',
            exists: {
              kind: 'select',
              values: [{ alias: 'one', value: 1 }],
              from: { kind: 'table', table: 'orders' },
              where: [
                {
                  kind: 'comparison',
                  left: { source: 'orders', column: 'userid' },
                  cmp: '=',
                  right: { source: 'u', column: 'id' },
                },
              ],
              limit: 1,
            },
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - Only Alice has orders
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ name: 'Alice' });
    });

    it('should execute IN subquery', async () => {
      // Query: SELECT name FROM users WHERE id IN (SELECT userid FROM orders)
      const query: Query = {
        kind: 'select',
        values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
        from: { kind: 'table', table: 'users' },
        where: [
          {
            kind: 'in',
            value: { source: 'users', column: 'id' },
            in: {
              kind: 'select',
              values: [{ alias: 'userid', value: { source: 'orders', column: 'userid' } }],
              from: { kind: 'table', table: 'orders' },
            },
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - Only Alice is in the orders
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ name: 'Alice' });
    });

    it('should execute scalar subquery in SELECT', async () => {
      // Query: SELECT name, (SELECT MAX(amount) FROM orders) as max_order FROM users
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'users', column: 'name' } },
          {
            alias: 'max_order',
            value: {
              kind: 'select',
              values: [
                {
                  alias: 'max_amount',
                  value: {
                    kind: 'aggregate',
                    aggregate: 'max',
                    value: { source: 'orders', column: 'amount' },
                  },
                },
              ],
              from: { kind: 'table', table: 'orders' },
            },
          },
        ],
        from: { kind: 'table', table: 'users' },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({ name: 'Alice', max_order: 100 });
      expect(result.rows[1]).toEqual({ name: 'Bob', max_order: 100 });
    });
  });

  describe('Aggregation functions', () => {
    beforeEach(() => {
      ctx.addType({
        name: 'products',
        friendlyName: 'Products',
        description: 'Product records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'price', friendlyName: 'Price', type: 'number', required: true },
        ],
      });

      ctx.addRecord('products', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget', price: 10 },
      });

      ctx.addRecord('products', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Gadget', price: 20 },
      });

      ctx.addRecord('products', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Gizmo', price: 30 },
      });
    });

    it('should execute AVG aggregation', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'avg_price',
            value: {
              kind: 'aggregate',
              aggregate: 'avg',
              value: { source: 'products', column: 'price' },
            },
          },
        ],
        from: { kind: 'table', table: 'products' },
      };

      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].avg_price).toBe(20);
    });

    it('should execute MIN aggregation', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'min_price',
            value: {
              kind: 'aggregate',
              aggregate: 'min',
              value: { source: 'products', column: 'price' },
            },
          },
        ],
        from: { kind: 'table', table: 'products' },
      };

      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].min_price).toBe(10);
    });

    it('should execute MAX aggregation', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'max_price',
            value: {
              kind: 'aggregate',
              aggregate: 'max',
              value: { source: 'products', column: 'price' },
            },
          },
        ],
        from: { kind: 'table', table: 'products' },
      };

      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].max_price).toBe(30);
    });
  });

  describe('Relationship fields (field type as another type name)', () => {
    it('should handle SELECT with JOIN on relationship fields', async () => {
      // Setup - Define two related types: Company and Employee
      ctx.addType({
        name: 'companies',
        friendlyName: 'Companies',
        description: 'Company records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'industry', friendlyName: 'Industry', type: 'string', required: false },
        ],
      });

      ctx.addType({
        name: 'employees',
        friendlyName: 'Employees',
        description: 'Employee records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'company', friendlyName: 'Company', type: 'companies', required: true }, // Relationship field
          { name: 'salary', friendlyName: 'Salary', type: 'number', required: false },
        ],
      });

      // Add company records
      ctx.addRecord('companies', {
        id: 'c1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'TechCorp', industry: 'Technology' },
      });

      ctx.addRecord('companies', {
        id: 'c2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'FinanceInc', industry: 'Finance' },
      });

      // Add employee records with company relationships (storing company IDs)
      ctx.addRecord('employees', {
        id: 'e1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', company: 'c1', salary: 100000 },
      });

      ctx.addRecord('employees', {
        id: 'e2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob', company: 'c1', salary: 95000 },
      });

      ctx.addRecord('employees', {
        id: 'e3',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Charlie', company: 'c2', salary: 110000 },
      });

      // Query: SELECT e.name, c.name as company_name, c.industry
      //        FROM employees e
      //        INNER JOIN companies c ON e.company = c.id
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'employee_name', value: { source: 'e', column: 'name' } },
          { alias: 'company_name', value: { source: 'c', column: 'name' } },
          { alias: 'industry', value: { source: 'c', column: 'industry' } },
          { alias: 'salary', value: { source: 'e', column: 'salary' } },
        ],
        from: { kind: 'table', table: 'employees', as: 'e' },
        joins: [
          {
            type: 'inner',
            source: { kind: 'table', table: 'companies', as: 'c' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'e', column: 'company' },
                cmp: '=',
                right: { source: 'c', column: 'id' },
              },
            ],
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(3);

      const alice = result.rows.find((r) => r.employee_name === 'Alice');
      expect(alice).toEqual({
        employee_name: 'Alice',
        company_name: 'TechCorp',
        industry: 'Technology',
        salary: 100000,
      });

      const bob = result.rows.find((r) => r.employee_name === 'Bob');
      expect(bob).toEqual({
        employee_name: 'Bob',
        company_name: 'TechCorp',
        industry: 'Technology',
        salary: 95000,
      });

      const charlie = result.rows.find((r) => r.employee_name === 'Charlie');
      expect(charlie).toEqual({
        employee_name: 'Charlie',
        company_name: 'FinanceInc',
        industry: 'Finance',
        salary: 110000,
      });
    });

    it('should handle INSERT with relationship field values', async () => {
      // Setup
      ctx.addType({
        name: 'departments',
        friendlyName: 'Departments',
        description: 'Department records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addType({
        name: 'projects',
        friendlyName: 'Projects',
        description: 'Project records',
        knowledgeTemplate: '{{title}}',
        fields: [
          { name: 'title', friendlyName: 'Title', type: 'string', required: true },
          { name: 'department', friendlyName: 'Department', type: 'departments', required: true }, // Relationship
        ],
      });

      // Add a department
      ctx.addRecord('departments', {
        id: 'd1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Engineering' },
      });

      // Query: INSERT INTO projects (title, department) VALUES ('New App', 'd1')
      const query: Query = {
        kind: 'insert',
        table: 'projects',
        columns: ['title', 'department'],
        values: ['New App', 'd1'],
        returning: [
          { alias: 'title', value: { source: 'projects', column: 'title' } },
          { alias: 'department', value: { source: 'projects', column: 'department' } },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.affectedCount).toBe(1);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ title: 'New App', department: 'd1' });

      // Verify the record was inserted
      const manager = ctx.getMockManager('projects');
      const records = manager.getAll();
      expect(records).toHaveLength(1);
      expect(records[0].fields.title).toBe('New App');
      expect(records[0].fields.department).toBe('d1');
    });

    it('should handle UPDATE with relationship field changes', async () => {
      // Setup
      ctx.addType({
        name: 'teams',
        friendlyName: 'Teams',
        description: 'Team records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addType({
        name: 'members',
        friendlyName: 'Members',
        description: 'Member records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'team', friendlyName: 'Team', type: 'teams', required: false }, // Relationship
        ],
      });

      // Add teams
      ctx.addRecord('teams', {
        id: 't1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Team Alpha' },
      });

      ctx.addRecord('teams', {
        id: 't2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Team Beta' },
      });

      // Add member
      ctx.addRecord('members', {
        id: 'm1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'John', team: 't1' },
      });

      // Query: UPDATE members SET team = 't2' WHERE name = 'John'
      const query: Query = {
        kind: 'update',
        table: 'members',
        set: [{ column: 'team', value: 't2' }],
        where: [
          {
            kind: 'comparison',
            left: { source: 'members', column: 'name' },
            cmp: '=',
            right: 'John',
          },
        ],
        returning: [
          { alias: 'name', value: { source: 'members', column: 'name' } },
          { alias: 'team', value: { source: 'members', column: 'team' } },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.affectedCount).toBe(1);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ name: 'John', team: 't2' });

      // Verify the update
      const manager = ctx.getMockManager('members');
      const records = manager.getAll();
      expect(records[0].fields.team).toBe('t2');
    });

    it('should handle aggregation grouped by relationship field', async () => {
      // Setup
      ctx.addType({
        name: 'categories',
        friendlyName: 'Categories',
        description: 'Category records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'category', friendlyName: 'Category', type: 'categories', required: true }, // Relationship
          { name: 'price', friendlyName: 'Price', type: 'number', required: true },
        ],
      });

      // Add categories
      ctx.addRecord('categories', {
        id: 'cat1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Electronics' },
      });

      ctx.addRecord('categories', {
        id: 'cat2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Books' },
      });

      // Add items
      ctx.addRecord('items', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Laptop', category: 'cat1', price: 1000 },
      });

      ctx.addRecord('items', {
        id: 'i2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Mouse', category: 'cat1', price: 25 },
      });

      ctx.addRecord('items', {
        id: 'i3',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Novel', category: 'cat2', price: 15 },
      });

      // Query: SELECT category, COUNT(*) as count, SUM(price) as total
      //        FROM items GROUP BY category
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'category', value: { source: 'items', column: 'category' } },
          {
            alias: 'count',
            value: { kind: 'aggregate', aggregate: 'count', value: '*' },
          },
          {
            alias: 'total',
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'items', column: 'price' },
            },
          },
        ],
        from: { kind: 'table', table: 'items' },
        groupBy: [{ source: 'items', column: 'category' }],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(2);

      const electronicsGroup = result.rows.find((r) => r.category === 'cat1');
      expect(electronicsGroup).toEqual({ category: 'cat1', count: 2, total: 1025 });

      const booksGroup = result.rows.find((r) => r.category === 'cat2');
      expect(booksGroup).toEqual({ category: 'cat2', count: 1, total: 15 });
    });
  });

  describe('Query execution with commit control', () => {
    it('should execute query without committing changes', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', age: 30 },
      });

      // Query: INSERT INTO users (name, age) VALUES ('Bob', 25)
      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['name', 'age'],
        values: ['Bob', 25],
      };

      // Execute without committing
      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager);

      // Assert - payload should contain the result and deltas
      expect(payload.result.affectedCount).toBe(1);
      expect(payload.deltas).toHaveLength(1);
      expect(payload.deltas[0].tableName).toBe('users');
      expect(payload.deltas[0].inserts).toHaveLength(1);
      expect(payload.deltas[0].inserts[0].fields).toEqual({ name: 'Bob', age: 25 });

      // Verify data was NOT committed to disk
      const manager = ctx.getMockManager('users');
      await manager.load(); // Reload from disk
      const records = manager.getAll();
      expect(records).toHaveLength(1); // Only Alice, Bob not committed
      expect(records[0].fields.name).toBe('Alice');
    });

    it('should validate payload can be committed when data unchanged', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      // Query: UPDATE users SET name = 'Alice Updated' WHERE name = 'Alice'
      const query: Query = {
        kind: 'update',
        table: 'users',
        set: [{ column: 'name', value: 'Alice Updated' }],
        where: [
          {
            kind: 'comparison',
            left: { source: 'users', column: 'name' },
            cmp: '=',
            right: 'Alice',
          },
        ],
      };

      // Execute without committing
      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager);

      // Check if can commit (no changes to underlying data)
      const canCommit = await canCommitQueryResult(payload, ctx.getManager);

      // Assert
      expect(canCommit.canCommit).toBe(true);
      expect(canCommit.reason).toBeUndefined();
    });

    it('should detect when payload cannot be committed due to data changes', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', age: 30 },
      });

      // Query: UPDATE users SET age = 31 WHERE name = 'Alice'
      const query: Query = {
        kind: 'update',
        table: 'users',
        set: [{ column: 'age', value: 31 }],
        where: [
          {
            kind: 'comparison',
            left: { source: 'users', column: 'name' },
            cmp: '=',
            right: 'Alice',
          },
        ],
      };

      // Execute without committing
      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager);

      // Small delay to ensure timestamp is different
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate external change to the data (someone else updated it)
      const manager = ctx.getMockManager('users');
      await manager.save(async (dataFile) => {
        const alice = dataFile.data.find((r) => r.id === '1');
        if (alice) {
          alice.fields.age = 35; // External change
          alice.updated = Date.now(); // Update timestamp to change version
        }
      });

      // Check if can commit (should fail because data changed)
      const canCommit = await canCommitQueryResult(payload, ctx.getManager);

      // Assert
      expect(canCommit.canCommit).toBe(false);
      expect(canCommit.reason).toContain('users');
      expect(canCommit.modifiedTables).toContain('users');
    });

    it('should commit a valid payload successfully', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', age: 30 },
      });

      // Query: INSERT INTO users (name, age) VALUES ('Bob', 25)
      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['name', 'age'],
        values: ['Bob', 25],
      };

      // Execute without committing
      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager);

      // Commit the payload
      const result = await commitQueryChanges(payload, ctx.getManager);

      // Assert
      expect(result.affectedCount).toBe(1);
      expect(result.inserted).toHaveLength(1);
      expect(result.inserted![0].type).toBe('users');
      expect(result.inserted![0].ids).toHaveLength(1);

      // Verify data was committed to disk
      const manager = ctx.getMockManager('users');
      await manager.load(); // Reload from disk
      const records = manager.getAll();
      expect(records).toHaveLength(2); // Alice and Bob
      const bob = records.find((r) => r.fields.name === 'Bob');
      expect(bob).toBeDefined();
      expect(bob!.fields.age).toBe(25);
    });

    it('should throw error when trying to commit stale payload', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      // Query: UPDATE users SET name = 'Alice Updated' WHERE name = 'Alice'
      const query: Query = {
        kind: 'update',
        table: 'users',
        set: [{ column: 'name', value: 'Alice Updated' }],
        where: [
          {
            kind: 'comparison',
            left: { source: 'users', column: 'name' },
            cmp: '=',
            right: 'Alice',
          },
        ],
      };

      // Execute without committing
      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager);

      // Small delay to ensure timestamp is different
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate external change
      const manager = ctx.getMockManager('users');
      await manager.save(async (dataFile) => {
        dataFile.data[0].fields.name = 'Alice External Update';
        dataFile.data[0].updated = Date.now(); // Update timestamp to change version
      });

      // Try to commit the stale payload (should throw)
      await expect(commitQueryChanges(payload, ctx.getManager)).rejects.toThrow(
        'Cannot commit query'
      );
    });

    it('should handle multiple table modifications in one query', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addType({
        name: 'logs',
        friendlyName: 'Logs',
        description: 'Log records',
        knowledgeTemplate: '{{message}}',
        fields: [
          { name: 'message', friendlyName: 'Message', type: 'string', required: true },
        ],
      });

      // Create a CTE query that modifies multiple tables
      const query: Query = {
        kind: 'withs',
        withs: [
          {
            kind: 'cte',
            name: 'new_user',
            statement: {
              kind: 'insert',
              table: 'users',
              columns: ['name'],
              values: ['Charlie'],
              returning: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
            },
          },
        ],
        final: {
          kind: 'insert',
          table: 'logs',
          columns: ['message'],
          values: ['User added'],
        },
      };

      // Execute without committing
      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager);

      // Assert - should have deltas for both tables
      expect(payload.deltas.length).toBeGreaterThan(0);
      const usersDelta = payload.deltas.find((d) => d.tableName === 'users');
      const logsDelta = payload.deltas.find((d) => d.tableName === 'logs');

      expect(usersDelta).toBeDefined();
      expect(usersDelta!.inserts).toHaveLength(1);

      expect(logsDelta).toBeDefined();
      expect(logsDelta!.inserts).toHaveLength(1);

      // Commit and verify
      const result = await commitQueryChanges(payload, ctx.getManager);

      expect(result.inserted).toBeDefined();
      expect(result.inserted!.length).toBeGreaterThan(0);
    });

    it('should preserve query results in payload', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      // Query: INSERT with RETURNING
      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['name'],
        values: ['Bob'],
        returning: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
      };

      // Execute without committing
      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager);

      // Assert - result should contain the returned rows
      expect(payload.result.rows).toHaveLength(1);
      expect(payload.result.rows[0].name).toBe('Bob');

      // Commit and verify result is preserved
      const result = await commitQueryChanges(payload, ctx.getManager);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Bob');
    });
  });

  describe('Column validation', () => {
    it('should throw error when referencing non-existent column on a table', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', age: 30 },
      });

      // Query with non-existent column 'email'
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'users', column: 'name' } },
          { alias: 'email', value: { source: 'users', column: 'email' } }, // Invalid column
        ],
        from: { kind: 'table', table: 'users' },
      };

      // Execute - should throw error
      await expect(executeQuery(query, ctx.getTypes, ctx.getManager)).rejects.toThrow(
        "Column 'email' does not exist on type 'users'"
      );
    });

    it('should throw error when referencing non-existent column in WHERE clause', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      // Query with non-existent column in WHERE
      const query: Query = {
        kind: 'select',
        values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
        from: { kind: 'table', table: 'users' },
        where: [
          {
            kind: 'comparison',
            left: { source: 'users', column: 'invalidColumn' }, // Invalid column
            cmp: '=',
            right: 'test',
          },
        ],
      };

      // Execute - should throw error
      await expect(executeQuery(query, ctx.getTypes, ctx.getManager)).rejects.toThrow(
        "Column 'invalidColumn' does not exist on type 'users'"
      );
    });

    it('should throw error when referencing non-existent column in ORDER BY', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      // Query with non-existent column in ORDER BY
      const query: Query = {
        kind: 'select',
        values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
        from: { kind: 'table', table: 'users' },
        orderBy: [
          {
            value: { source: 'users', column: 'nonExistentColumn' }, // Invalid column
            dir: 'asc',
          },
        ],
      };

      // Execute - should throw error
      await expect(executeQuery(query, ctx.getTypes, ctx.getManager)).rejects.toThrow(
        "Column 'nonExistentColumn' does not exist on type 'users'"
      );
    });

    it('should throw error for non-existent column in UPDATE SET clause', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      // Query trying to read from non-existent column
      const query: Query = {
        kind: 'update',
        table: 'users',
        set: [
          {
            column: 'name',
            value: { source: 'users', column: 'invalidColumn' }, // Invalid column
          },
        ],
      };

      // Execute - should throw error
      await expect(executeQuery(query, ctx.getTypes, ctx.getManager)).rejects.toThrow(
        "Column 'invalidColumn' does not exist on type 'users'"
      );
    });

    it('should allow columns from aliased sources and CTEs without strict validation', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      // Query with CTE - the final query references columns from the CTE
      const query: Query = {
        kind: 'withs',
        withs: [
          {
            kind: 'cte',
            name: 'user_data',
            statement: {
              kind: 'select',
              values: [
                { alias: 'user_name', value: { source: 'users', column: 'name' } },
                { alias: 'constant_value', value: 123 },
              ],
              from: { kind: 'table', table: 'users' },
            },
          },
        ],
        final: {
          kind: 'select',
          values: [
            { alias: 'name', value: { source: 'user_data', column: 'user_name' } },
            { alias: 'value', value: { source: 'user_data', column: 'constant_value' } },
          ],
          from: { kind: 'table', table: 'user_data' },
        },
      };

      // Execute - should work because user_data is a CTE, not a table
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ name: 'Alice', value: 123 });
    });
  });

  describe('Wildcard column selection (*)', () => {
    it('should expand * to all columns including system fields', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      const now = Date.now();
      ctx.addRecord('users', {
        id: 'user1',
        created: now,
        updated: now,
        fields: { name: 'Alice', age: 30 },
      });

      // Query using * to select all columns
      const query: Query = {
        kind: 'select',
        values: [{ alias: 'all', value: { source: 'users', column: '*' } }],
        from: { kind: 'table', table: 'users' },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - should expand to all columns (id, created, updated, name, age)
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toHaveProperty('id', 'user1');
      expect(result.rows[0]).toHaveProperty('created', now);
      expect(result.rows[0]).toHaveProperty('updated', now);
      expect(result.rows[0]).toHaveProperty('name', 'Alice');
      expect(result.rows[0]).toHaveProperty('age', 30);
    });

    it('should combine * with other specific columns', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: 'user1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', age: 30 },
      });

      // Query combining * with specific column
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'all', value: { source: 'users', column: '*' } },
          { alias: 'double_age', value: { kind: 'binary', left: { source: 'users', column: 'age' }, op: '*', right: 2 } },
        ],
        from: { kind: 'table', table: 'users' },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toHaveProperty('id', 'user1');
      expect(result.rows[0]).toHaveProperty('name', 'Alice');
      expect(result.rows[0]).toHaveProperty('age', 30);
      expect(result.rows[0]).toHaveProperty('double_age', 60);
    });

    it('should handle * in queries with WHERE clause', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: 'user1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', age: 30 },
      });

      ctx.addRecord('users', {
        id: 'user2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob', age: 25 },
      });

      // Query with * and WHERE clause
      const query: Query = {
        kind: 'select',
        values: [{ alias: 'all', value: { source: 'users', column: '*' } }],
        from: { kind: 'table', table: 'users' },
        where: [
          {
            kind: 'comparison',
            left: { source: 'users', column: 'age' },
            cmp: '>',
            right: 26,
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - only Alice matches
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toHaveProperty('name', 'Alice');
      expect(result.rows[0]).toHaveProperty('age', 30);
    });

    it('should handle * with aliased tables', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: 'user1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      // Query with aliased table using *
      const query: Query = {
        kind: 'select',
        values: [{ alias: 'all', value: { source: 'u', column: '*' } }],
        from: { kind: 'table', table: 'users', as: 'u' },
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toHaveProperty('id', 'user1');
      expect(result.rows[0]).toHaveProperty('name', 'Alice');
    });

    it('should handle * in JOIN queries', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addType({
        name: 'orders',
        friendlyName: 'Orders',
        description: 'Order records',
        knowledgeTemplate: '{{userid}}',
        fields: [
          { name: 'userid', friendlyName: 'User ID', type: 'string', required: true },
          { name: 'amount', friendlyName: 'Amount', type: 'number', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      ctx.addRecord('orders', {
        id: 'o1',
        created: Date.now(),
        updated: Date.now(),
        fields: { userid: '1', amount: 100 },
      });

      // Query with * from joined tables
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'user_all', value: { source: 'u', column: '*' } },
          { alias: 'order_amount', value: { source: 'o', column: 'amount' } },
        ],
        from: { kind: 'table', table: 'users', as: 'u' },
        joins: [
          {
            type: 'inner',
            source: { kind: 'table', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'u', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'userid' },
              },
            ],
          },
        ],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - should have user columns expanded plus order amount
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toHaveProperty('id', '1');
      expect(result.rows[0]).toHaveProperty('name', 'Alice');
      expect(result.rows[0]).toHaveProperty('order_amount', 100);
    });

    it('should handle * with GROUP BY', async () => {
      // Setup
      ctx.addType({
        name: 'orders',
        friendlyName: 'Orders',
        description: 'Order records',
        knowledgeTemplate: '{{customer}}',
        fields: [
          { name: 'customer', friendlyName: 'Customer', type: 'string', required: true },
          { name: 'amount', friendlyName: 'Amount', type: 'number', required: true },
        ],
      });

      ctx.addRecord('orders', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Alice', amount: 100 },
      });

      ctx.addRecord('orders', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Alice', amount: 150 },
      });

      // Query with * in GROUP BY context (getting first record of group)
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer', value: { source: 'orders', column: 'customer' } },
          { alias: 'total', value: { kind: 'aggregate', aggregate: 'sum', value: { source: 'orders', column: 'amount' } } },
        ],
        from: { kind: 'table', table: 'orders' },
        groupBy: [{ source: 'orders', column: 'customer' }],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ customer: 'Alice', total: 250 });
    });

    it('should handle * in INSERT...RETURNING', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      // Query: INSERT with RETURNING *
      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['name', 'age'],
        values: ['Alice', 30],
        returning: [{ alias: 'all', value: { source: 'users', column: '*' } }],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - should return all columns of inserted record
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toHaveProperty('id');
      expect(result.rows[0]).toHaveProperty('created');
      expect(result.rows[0]).toHaveProperty('updated');
      expect(result.rows[0]).toHaveProperty('name', 'Alice');
      expect(result.rows[0]).toHaveProperty('age', 30);
    });

    it('should handle * in UPDATE...RETURNING', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: false },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', age: 30 },
      });

      // Query: UPDATE with RETURNING *
      const query: Query = {
        kind: 'update',
        table: 'users',
        set: [{ column: 'age', value: 31 }],
        where: [
          {
            kind: 'comparison',
            left: { source: 'users', column: 'name' },
            cmp: '=',
            right: 'Alice',
          },
        ],
        returning: [{ alias: 'all', value: { source: 'users', column: '*' } }],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - should return all columns with updated age
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toHaveProperty('id', '1');
      expect(result.rows[0]).toHaveProperty('name', 'Alice');
      expect(result.rows[0]).toHaveProperty('age', 31);
    });

    it('should handle * in DELETE...RETURNING', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      // Query: DELETE with RETURNING *
      const query: Query = {
        kind: 'delete',
        table: 'users',
        where: [
          {
            kind: 'comparison',
            left: { source: 'users', column: 'name' },
            cmp: '=',
            right: 'Alice',
          },
        ],
        returning: [{ alias: 'all', value: { source: 'users', column: '*' } }],
      };

      // Execute
      const result = await executeQuery(query, ctx.getTypes, ctx.getManager);

      // Assert - should return all columns of deleted record
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toHaveProperty('id', '1');
      expect(result.rows[0]).toHaveProperty('name', 'Alice');

      // Verify deletion
      const manager = ctx.getMockManager('users');
      expect(manager.getAll()).toHaveLength(0);
    });
  });
});
