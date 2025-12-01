import { describe, it, expect, beforeEach } from '@jest/globals';
import { executeQuery, IDataManager } from '../dba-query';
import type { Query } from '../dba';
import { DataRecord, DataFile, TypeDefinition } from '../../schemas';

/**
 * Mock implementation of IDataManager for testing
 */
class MockDataManager implements IDataManager {
  private data: DataFile;
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

  async save(fn: (dataFile: DataFile) => void | Promise<void>): Promise<void> {
    if (!this.loaded) {
      throw new Error('Must call load() before save()');
    }
    await fn(this.data);
    this.data.updated = Date.now();
  }

  getAll(): DataRecord[] {
    return this.data.data;
  }

  // Test helper methods
  addRecord(record: DataRecord): void {
    this.data.data.push(record);
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
});
