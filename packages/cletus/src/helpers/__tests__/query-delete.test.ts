/**
 * Comprehensive tests for DELETE queries
 * Tests basic DELETE, DELETE with WHERE, DELETE with RETURNING, DELETE with JOINs, and alias handling
 */

import { executeQuery, executeQueryWithoutCommit } from '../query';
import type { Query } from '../dba';
import { TestContext } from './test-helpers';

describe('DELETE queries', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = new TestContext();
  });

  describe('Basic DELETE', () => {
    it('should delete all records when no WHERE clause', async () => {
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

      // Query: DELETE FROM users
      const query: Query = {
        kind: 'delete',
        table: 'users',
      };

      // Execute
      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Assert
      expect(result.affectedCount).toBe(2);
      expect(result.deleted).toHaveLength(1);
      expect(result.deleted![0].type).toBe('users');
      expect(result.deleted![0].ids).toEqual(['1', '2']);

      // Verify data was actually deleted
      const manager = ctx.getMockManager('users');
      const records = manager.getAll();
      expect(records).toHaveLength(0);
    });

    it('should handle DELETE with no matching records', async () => {
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

      // Query: DELETE FROM users (empty table)
      const query: Query = {
        kind: 'delete',
        table: 'users',
      };

      // Execute
      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Assert
      expect(result.affectedCount).toBe(0);
      expect(result.deleted).toBeUndefined();
    });
  });

  describe('DELETE with WHERE clause', () => {
    it('should delete records matching WHERE condition', async () => {
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

      ctx.addRecord('users', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Charlie', age: 35 },
      });

      // Query: DELETE FROM users WHERE age >= 30
      const query: Query = {
        kind: 'delete',
        table: 'users',
        where: [
          {
            kind: 'comparison',
            left: { source: 'users', column: 'age' },
            cmp: '>=',
            right: 30,
          },
        ],
      };

      // Execute
      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Assert
      expect(result.affectedCount).toBe(2);
      expect(result.deleted).toHaveLength(1);
      expect(result.deleted![0].type).toBe('users');
      expect(result.deleted![0].ids).toEqual(['1', '3']);

      // Verify correct records were deleted
      const manager = ctx.getMockManager('users');
      const records = manager.getAll();
      expect(records).toHaveLength(1);
      expect(records[0].fields.name).toBe('Bob');
    });

    it('should delete records with complex WHERE conditions', async () => {
      // Setup
      ctx.addType({
        name: 'products',
        friendlyName: 'Products',
        description: 'Product records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'price', friendlyName: 'Price', type: 'number', required: true },
          { name: 'category', friendlyName: 'Category', type: 'string', required: true },
        ],
      });

      ctx.addRecord('products', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget', price: 10, category: 'electronics' },
      });

      ctx.addRecord('products', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Gadget', price: 25, category: 'electronics' },
      });

      ctx.addRecord('products', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Book', price: 15, category: 'books' },
      });

      // Query: DELETE FROM products WHERE category = 'electronics' AND price < 20
      const query: Query = {
        kind: 'delete',
        table: 'products',
        where: [
          {
            kind: 'comparison',
            left: { source: 'products', column: 'category' },
            cmp: '=',
            right: 'electronics',
          },
          {
            kind: 'comparison',
            left: { source: 'products', column: 'price' },
            cmp: '<',
            right: 20,
          },
        ],
      };

      // Execute
      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Assert
      expect(result.affectedCount).toBe(1);
      expect(result.deleted![0].ids).toEqual(['1']);

      // Verify correct records remain
      const manager = ctx.getMockManager('products');
      const records = manager.getAll();
      expect(records).toHaveLength(2);
      expect(records.find(r => r.id === '2')).toBeDefined();
      expect(records.find(r => r.id === '3')).toBeDefined();
    });
  });

  describe('DELETE with RETURNING', () => {
    it('should return deleted values', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'email', friendlyName: 'Email', type: 'string', required: true },
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
        fields: { name: 'Bob', email: 'bob@example.com' },
      });

      // Query: DELETE FROM users WHERE name = 'Alice' RETURNING *
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
        returning: [
          { alias: 'all', value: { source: 'users', column: '*' } },
        ],
      };

      // Execute
      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Assert
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        id: '1',
        name: 'Alice',
        email: 'alice@example.com',
      });
      expect(result.affectedCount).toBe(1);
    });

    it('should return specific columns from deleted records', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'email', friendlyName: 'Email', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', email: 'alice@example.com', age: 30 },
      });

      // Query: DELETE FROM users RETURNING name, age
      const query: Query = {
        kind: 'delete',
        table: 'users',
        returning: [
          { alias: 'name', value: { source: 'users', column: 'name' } },
          { alias: 'age', value: { source: 'users', column: 'age' } },
        ],
      };

      // Execute
      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Assert
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({
        name: 'Alice',
        age: 30,
      });
    });
  });

  describe('DELETE with table alias', () => {
    it('should work with alias in WHERE clause', async () => {
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

      // Query: DELETE FROM users u WHERE u.name = 'Alice'
      const query: Query = {
        kind: 'delete',
        table: 'users',
        as: 'u',
        where: [
          {
            kind: 'comparison',
            left: { source: 'u', column: 'name' },
            cmp: '=',
            right: 'Alice',
          },
        ],
      };

      // Execute
      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Assert
      expect(result.affectedCount).toBe(1);
      expect(result.deleted![0].ids).toEqual(['1']);

      // Verify correct record was deleted
      const manager = ctx.getMockManager('users');
      const records = manager.getAll();
      expect(records).toHaveLength(1);
      expect(records[0].fields.name).toBe('Bob');
    });

    it('should work with alias in RETURNING clause', async () => {
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

      // Query: DELETE FROM users u RETURNING u.name
      const query: Query = {
        kind: 'delete',
        table: 'users',
        as: 'u',
        returning: [
          { alias: 'name', value: { source: 'u', column: 'name' } },
        ],
      };

      // Execute
      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Assert
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ name: 'Alice' });
    });

    it('should FAIL when using table name instead of alias in WHERE clause', async () => {
      // Setup
      ctx.addType({
        name: 'transaction',
        friendlyName: 'Transactions',
        description: 'Transaction records',
        knowledgeTemplate: '{{description}}',
        fields: [
          { name: 'accountid', friendlyName: 'Account ID', type: 'string', required: true },
          { name: 'description', friendlyName: 'Description', type: 'string', required: true },
        ],
      });

      ctx.addRecord('transaction', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: {
          accountid: 'acc123',
          description: 'OPENROUTER INC 11-20 OPENROUTER.AI NY 7114 DEBIT CARD RECURRING PYMT',
        },
      });

      ctx.addRecord('transaction', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: {
          accountid: 'acc456',
          description: 'Some other transaction',
        },
      });

      // This is the FAILING query from the user - it uses 'transaction' as source
      // but the table has alias 't', so the WHERE clause can't find the data
      const query: Query = {
        kind: 'delete',
        table: 'transaction',
        as: 't',
        joins: [],
        where: [
          {
            kind: 'comparison',
            left: {
              source: 'transaction', // BUG: should be 't' to match the alias
              column: 'accountid',
            },
            cmp: '=',
            right: 'OPENROUTER INC 11-20 OPENROUTER.AI NY 7114 DEBIT CARD RECURRING PYMT',
          },
        ],
        returning: [
          {
            alias: 'all',
            value: {
              source: 'transaction', // BUG: should be 't' to match the alias
              column: '*',
            },
          },
        ],
      };

      // Execute without commit so we can check validation errors
      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);
      const result = payload.result;

      // The query will execute but won't match any records because
      // the WHERE clause is looking for source 'transaction' but the
      // SelectRecord only has the data under source 't'
      expect(result.affectedCount).toBe(0);
      expect(result.deleted).toBeUndefined();
      expect(result.rows).toHaveLength(0);

      // Validation errors should be produced to help identify the issue
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.length).toBeGreaterThan(0);

      // Check that the error mentions the source not being found and suggests available sources
      const sourceNotFoundErrors = result.validationErrors?.filter(e =>
        e.message.includes("Source 'transaction' not found") &&
        e.message.includes('Available sources')
      );
      expect(sourceNotFoundErrors?.length).toBeGreaterThan(0);

      // At least one error should mention the available alias 't'
      const hasAliasT = sourceNotFoundErrors?.some(e => e.message.includes('t'));
      expect(hasAliasT).toBe(true);

      // The error path should indicate where the issue occurred (WHERE or RETURNING)
      const whereError = sourceNotFoundErrors?.find(e => e.path.includes('where'));
      expect(whereError).toBeDefined();

      // Verify nothing was deleted
      const manager = ctx.getMockManager('transaction');
      const records = manager.getAll();
      expect(records).toHaveLength(2);
    });

    it('should SUCCEED when using correct alias in WHERE and RETURNING', async () => {
      // Setup
      ctx.addType({
        name: 'transaction',
        friendlyName: 'Transactions',
        description: 'Transaction records',
        knowledgeTemplate: '{{description}}',
        fields: [
          { name: 'accountid', friendlyName: 'Account ID', type: 'string', required: true },
          { name: 'description', friendlyName: 'Description', type: 'string', required: true },
        ],
      });

      ctx.addRecord('transaction', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: {
          accountid: 'acc123',
          description: 'OPENROUTER INC 11-20 OPENROUTER.AI NY 7114 DEBIT CARD RECURRING PYMT',
        },
      });

      ctx.addRecord('transaction', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: {
          accountid: 'acc456',
          description: 'Some other transaction',
        },
      });

      // CORRECTED query - uses 't' alias consistently
      const query: Query = {
        kind: 'delete',
        table: 'transaction',
        as: 't',
        joins: [],
        where: [
          {
            kind: 'comparison',
            left: {
              source: 't', // CORRECT: uses the alias
              column: 'accountid',
            },
            cmp: '=',
            right: 'acc123',
          },
        ],
        returning: [
          {
            alias: 'all',
            value: {
              source: 't', // CORRECT: uses the alias
              column: '*',
            },
          },
        ],
      };

      // Execute
      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Now it works correctly
      expect(result.affectedCount).toBe(1);
      expect(result.deleted![0].ids).toEqual(['1']);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        accountid: 'acc123',
        description: 'OPENROUTER INC 11-20 OPENROUTER.AI NY 7114 DEBIT CARD RECURRING PYMT',
      });

      // Verify correct record was deleted
      const manager = ctx.getMockManager('transaction');
      const records = manager.getAll();
      expect(records).toHaveLength(1);
      expect(records[0].fields.accountid).toBe('acc456');
    });
  });

  describe('DELETE with JOINs', () => {
    it('should delete from main table based on JOIN condition', async () => {
      // Setup
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'department_id', friendlyName: 'Department ID', type: 'string', required: true },
        ],
      });

      ctx.addType({
        name: 'departments',
        friendlyName: 'Departments',
        description: 'Department records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      const deptId1 = 'dept1';
      const deptId2 = 'dept2';

      ctx.addRecord('departments', {
        id: deptId1,
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Engineering' },
      });

      ctx.addRecord('departments', {
        id: deptId2,
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Sales' },
      });

      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', department_id: deptId1 },
      });

      ctx.addRecord('users', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob', department_id: deptId2 },
      });

      ctx.addRecord('users', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Charlie', department_id: deptId1 },
      });

      // Query: DELETE FROM users u JOIN departments d ON u.department_id = d.id WHERE d.name = 'Engineering'
      const query: Query = {
        kind: 'delete',
        table: 'users',
        as: 'u',
        joins: [
          {
            source: { kind: 'table', table: 'departments', as: 'd' },
            type: 'inner',
            on: [
              {
                kind: 'comparison',
                left: { source: 'u', column: 'department_id' },
                cmp: '=',
                right: { source: 'd', column: 'id' },
              },
            ],
          },
        ],
        where: [
          {
            kind: 'comparison',
            left: { source: 'd', column: 'name' },
            cmp: '=',
            right: 'Engineering',
          },
        ],
      };

      // Execute
      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Assert - should delete users in Engineering department
      expect(result.affectedCount).toBe(2);
      expect(result.deleted![0].ids).toEqual(['1', '3']);

      // Verify correct records remain
      const manager = ctx.getMockManager('users');
      const records = manager.getAll();
      expect(records).toHaveLength(1);
      expect(records[0].fields.name).toBe('Bob');
    });
  });
});
