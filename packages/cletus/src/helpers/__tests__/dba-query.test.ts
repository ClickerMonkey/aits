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
  });
});
