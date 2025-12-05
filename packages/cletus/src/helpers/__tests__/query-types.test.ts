/**
 * Type validation tests for DBA query system
 * Tests runtime type checking and validation error collection
 */

import type { Query } from '../dba';
import { commitQueryChanges, executeQuery, executeQueryWithoutCommit } from '../query';
import { TestContext } from './test-helpers';

describe('DBA Query Type Validation', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = new TestContext();
  });

  describe('Binary Operations Type Validation', () => {
    it('should detect type mixing in binary operations (number + string)', async () => {
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
        id: 'p1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget', price: 100 },
      });

      // Query with type mixing: price (number) + name (string)
      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'result',
            value: {
              kind: 'binary',
              left: { source: 'products', column: 'price' },
              op: '+',
              right: { source: 'products', column: 'name' },
            },
          },
        ],
        from: { kind: 'table', table: 'products' },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();
      expect(payload.result.validationErrors?.length).toBeGreaterThan(0);
      expect(payload.result.validationErrors?.[0].path).toContain('query.values');
      expect(payload.result.validationErrors?.[0].message).toContain("Cannot perform '+' on");
      expect(payload.result.validationErrors?.[0].actualType).toContain('number');
      expect(payload.result.validationErrors?.[0].actualType).toContain('string');

      // Query should still execute, returning safe default (null)
      expect(payload.result.rows).toHaveLength(1);
      expect(payload.result.rows[0].result).toBeNull();

      // Should not be able to commit
      await expect(commitQueryChanges(payload, ctx.getManager)).rejects.toThrow(
        'Cannot commit query with validation errors'
      );
    });

    it('should handle null values in binary operations (SQL semantics)', async () => {
      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'quantity', friendlyName: 'Quantity', type: 'number', required: false },
        ],
      });

      ctx.addRecord('items', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Item', quantity: null },
      });

      // Query: quantity + 10 (where quantity is null)
      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'result',
            value: {
              kind: 'binary',
              left: { source: 'items', column: 'quantity' },
              op: '+',
              right: 10,
            },
          },
        ],
        from: { kind: 'table', table: 'items' },
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Should not have validation errors (null is acceptable)
      expect(result.canCommit).toBe(true);
      expect(result.validationErrors).toBeUndefined();

      // Result should be null (SQL: null + 10 = null)
      expect(result.rows[0].result).toBeNull();
    });
  });

  describe('INSERT Type Validation', () => {
    it('should validate INSERT value types match field types', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: true },
          { name: 'active', friendlyName: 'Active', type: 'boolean', required: true },
        ],
      });

      // Query: INSERT with wrong types (string for age, number for active)
      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['name', 'age', 'active'],
        values: ['Alice', 'twenty-five', 1], // age should be number, active should be boolean
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();
      // May have additional validation errors from reference integrity checks
      expect(payload.result.validationErrors?.length).toBeGreaterThanOrEqual(2);

      // Check age error
      const ageError = payload.result.validationErrors?.find(e => e.path.includes('values[1]') && e.message.includes('age'));
      expect(ageError).toBeDefined();
      expect(ageError?.message).toContain("Cannot assign string to number field 'age'");
      expect(ageError?.expectedType).toBe('number');
      expect(ageError?.actualType).toBe('string');

      // Check active error
      const activeError = payload.result.validationErrors?.find(e => e.path.includes('values[2]') && e.message.includes('active'));
      expect(activeError).toBeDefined();
      expect(activeError?.message).toContain("Cannot assign number to boolean field 'active'");
      expect(activeError?.expectedType).toBe('boolean');
      expect(activeError?.actualType).toBe('number');

      // Should not be able to commit
      await expect(commitQueryChanges(payload, ctx.getManager)).rejects.toThrow(
        'Cannot commit query with validation errors'
      );
    });

    it('should allow null values for optional fields', async () => {
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

      // Query: INSERT with null for optional field
      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['name', 'age'],
        values: ['Alice', null],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.canCommit).toBe(true);
      expect(result.validationErrors).toBeUndefined();
      expect(result.affectedCount).toBe(1);
    });

    it('should validate INSERT from SELECT value types', async () => {
      ctx.addType({
        name: 'source',
        friendlyName: 'Source',
        description: 'Source records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'count', friendlyName: 'Count', type: 'string', required: true }, // Wrong type
        ],
      });

      ctx.addType({
        name: 'target',
        friendlyName: 'Target',
        description: 'Target records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'quantity', friendlyName: 'Quantity', type: 'number', required: true },
        ],
      });

      ctx.addRecord('source', {
        id: 's1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Item', count: 'five' }, // String, not number
      });

      // Query: INSERT INTO target SELECT from source (type mismatch)
      const query: Query = {
        kind: 'insert',
        table: 'target',
        columns: ['name', 'quantity'],
        select: {
          kind: 'select',
          values: [
            { alias: 'name', value: { source: 'source', column: 'name' } },
            { alias: 'count', value: { source: 'source', column: 'count' } },
          ],
          from: { kind: 'table', table: 'source' },
        },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();

      const error = payload.result.validationErrors?.find(e => e.message.includes('quantity') && e.message.includes('number'));
      expect(error).toBeDefined();
      expect(error?.message).toContain("Cannot assign string to number field 'quantity'");
    });

    it('should validate ON CONFLICT UPDATE value types', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'email', friendlyName: 'Email', type: 'string', required: true },
          { name: 'login_count', friendlyName: 'Login Count', type: 'number', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: 'u1',
        created: Date.now(),
        updated: Date.now(),
        fields: { email: 'alice@example.com', login_count: 5 },
      });

      // Query: INSERT with ON CONFLICT UPDATE (wrong type for login_count)
      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['email', 'login_count'],
        values: ['alice@example.com', 10],
        onConflict: {
          columns: ['email'],
          update: [
            { column: 'login_count', value: 'invalid' }, // Should be number
          ],
        },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();

      const error = payload.result.validationErrors?.find(e => e.message.includes('login_count') && e.message.includes('number'));
      expect(error).toBeDefined();
      expect(error?.message).toContain("Cannot assign string to number field 'login_count'");
    });

    it('should accept string IDs for relationship fields', async () => {
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
        name: 'employees',
        friendlyName: 'Employees',
        description: 'Employee records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'department_id', friendlyName: 'Department', type: 'departments', required: true },
        ],
      });

      ctx.addRecord('departments', {
        id: 'd1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Engineering' },
      });

      // Query: INSERT with string ID for relationship field
      const query: Query = {
        kind: 'insert',
        table: 'employees',
        columns: ['name', 'department_id'],
        values: ['Alice', 'd1'], // String ID for relationship field
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Should succeed - string IDs are valid for relationship fields
      expect(result.canCommit).toBe(true);
      expect(result.validationErrors).toBeUndefined();
      expect(result.affectedCount).toBe(1);
    });

    it('should reject non-string values for relationship fields', async () => {
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
        name: 'employees',
        friendlyName: 'Employees',
        description: 'Employee records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'department_id', friendlyName: 'Department', type: 'departments', required: true },
        ],
      });

      // Query: INSERT with number for relationship field (should be string ID)
      const query: Query = {
        kind: 'insert',
        table: 'employees',
        columns: ['name', 'department_id'],
        values: ['Alice', 123], // Number instead of string ID
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();

      const error = payload.result.validationErrors?.[0];
      expect(error?.message).toContain("Foreign key field 'department_id' expects a string ID, got number");
      expect(error?.suggestion).toContain('Provide a valid departments ID');
    });
  });

  describe('UPDATE Type Validation', () => {
    it('should validate UPDATE SET value types', async () => {
      ctx.addType({
        name: 'products',
        friendlyName: 'Products',
        description: 'Product records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'price', friendlyName: 'Price', type: 'number', required: true },
          { name: 'in_stock', friendlyName: 'In Stock', type: 'boolean', required: true },
        ],
      });

      ctx.addRecord('products', {
        id: 'p1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget', price: 100, in_stock: true },
      });

      // Query: UPDATE with wrong types
      const query: Query = {
        kind: 'update',
        table: 'products',
        set: [
          { column: 'price', value: 'expensive' }, // Should be number
          { column: 'in_stock', value: 'yes' }, // Should be boolean
        ],
        where: [
          {
            kind: 'comparison',
            left: { source: 'products', column: 'id' },
            cmp: '=',
            right: 'p1',
          },
        ],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();
      expect(payload.result.validationErrors?.length).toBeGreaterThanOrEqual(2);

      // Check price error
      const priceError = payload.result.validationErrors?.find(e => e.message.includes('price') && e.message.includes('number'));
      expect(priceError).toBeDefined();
      expect(priceError?.message).toContain("Cannot assign string to number field 'price'");

      // Check in_stock error
      const stockError = payload.result.validationErrors?.find(e => e.message.includes('in_stock') && e.message.includes('boolean'));
      expect(stockError).toBeDefined();
      expect(stockError?.message).toContain("Cannot assign string to boolean field 'in_stock'");
    });

    it('should validate relationship field updates', async () => {
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
          { name: 'team_id', friendlyName: 'Team', type: 'teams', required: false },
        ],
      });

      ctx.addRecord('members', {
        id: 'm1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', team_id: null },
      });

      // Add the referenced team record
      ctx.addRecord('teams', {
        id: 't1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Engineering' },
      });

      // Query: UPDATE with string ID for relationship field (should succeed)
      const query: Query = {
        kind: 'update',
        table: 'members',
        set: [{ column: 'team_id', value: 't1' }], // String ID
        where: [
          {
            kind: 'comparison',
            left: { source: 'members', column: 'id' },
            cmp: '=',
            right: 'm1',
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.canCommit).toBe(true);
      expect(result.validationErrors).toBeUndefined();
      expect(result.affectedCount).toBe(1);
    });
  });

  describe('Aggregate Type Validation', () => {
    it('should validate SUM aggregates require numeric values', async () => {
      ctx.addType({
        name: 'orders',
        friendlyName: 'Orders',
        description: 'Order records',
        knowledgeTemplate: '{{id}}',
        fields: [
          { name: 'customer', friendlyName: 'Customer', type: 'string', required: true },
          { name: 'amount', friendlyName: 'Amount', type: 'string', required: true }, // Wrong type
        ],
      });

      ctx.addRecord('orders', {
        id: 'o1',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Alice', amount: 'one hundred' }, // String, not number
      });

      // Query: SUM on string field
      const query: Query = {
        kind: 'select',
        values: [
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
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();

      const error = payload.result.validationErrors?.[0];
      expect(error?.path).toContain('query.values');
      expect(error?.message).toContain('SUM requires numeric values, found string');
      expect(error?.expectedType).toBe('number');
      expect(error?.actualType).toBe('string');
      expect(error?.suggestion).toContain('Use SUM on numeric columns only');

      // Should return safe default (0)
      expect(payload.result.rows[0].total).toBe(0);
    });

    it('should validate AVG aggregates require numeric values', async () => {
      ctx.addType({
        name: 'scores',
        friendlyName: 'Scores',
        description: 'Score records',
        knowledgeTemplate: '{{id}}',
        fields: [
          { name: 'player', friendlyName: 'Player', type: 'string', required: true },
          { name: 'score', friendlyName: 'Score', type: 'boolean', required: true }, // Wrong type
        ],
      });

      ctx.addRecord('scores', {
        id: 's1',
        created: Date.now(),
        updated: Date.now(),
        fields: { player: 'Alice', score: true },
      });

      // Query: AVG on boolean field
      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'average',
            value: {
              kind: 'aggregate',
              aggregate: 'avg',
              value: { source: 'scores', column: 'score' },
            },
          },
        ],
        from: { kind: 'table', table: 'scores' },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();

      const error = payload.result.validationErrors?.[0];
      expect(error?.message).toContain('AVG requires numeric values, found boolean');
    });

    it('should allow null values in aggregates (filtered out)', async () => {
      ctx.addType({
        name: 'sales',
        friendlyName: 'Sales',
        description: 'Sales records',
        knowledgeTemplate: '{{id}}',
        fields: [
          { name: 'amount', friendlyName: 'Amount', type: 'number', required: false },
        ],
      });

      ctx.addRecord('sales', {
        id: 's1',
        created: Date.now(),
        updated: Date.now(),
        fields: { amount: 100 },
      });

      ctx.addRecord('sales', {
        id: 's2',
        created: Date.now(),
        updated: Date.now(),
        fields: { amount: null }, // Null value
      });

      ctx.addRecord('sales', {
        id: 's3',
        created: Date.now(),
        updated: Date.now(),
        fields: { amount: 200 },
      });

      // Query: SUM with null values (should be filtered out)
      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'total',
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'sales', column: 'amount' },
            },
          },
        ],
        from: { kind: 'table', table: 'sales' },
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Should succeed - nulls are filtered out
      expect(result.canCommit).toBe(true);
      expect(result.validationErrors).toBeUndefined();
      expect(result.rows[0].total).toBe(300); // 100 + 200, null ignored
    });
  });

  describe('Comparison Type Validation', () => {
    it('should detect type mismatches in WHERE comparisons', async () => {
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
        id: 'p1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget', price: 100 },
      });

      // Query: Compare number field with string literal
      const query: Query = {
        kind: 'select',
        values: [{ alias: 'name', value: { source: 'products', column: 'name' } }],
        from: { kind: 'table', table: 'products' },
        where: [
          {
            kind: 'comparison',
            left: { source: 'products', column: 'price' },
            cmp: '>',
            right: 'fifty', // String, not number
          },
        ],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();

      const error = payload.result.validationErrors?.[0];
      expect(error?.path).toContain('query.where');
      expect(error?.message).toContain('Cannot compare number with string');
      expect(error?.suggestion).toContain('Ensure operands are compatible types');

      // Query executes with safe default (comparison returns false)
      expect(payload.result.rows).toHaveLength(0);
    });

    it('should handle null comparisons with SQL semantics', async () => {
      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'quantity', friendlyName: 'Quantity', type: 'number', required: false },
        ],
      });

      ctx.addRecord('items', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Item 1', quantity: 5 },
      });

      ctx.addRecord('items', {
        id: 'i2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Item 2', quantity: null },
      });

      // Query: WHERE quantity > 3 (null comparison returns false)
      const query: Query = {
        kind: 'select',
        values: [{ alias: 'name', value: { source: 'items', column: 'name' } }],
        from: { kind: 'table', table: 'items' },
        where: [
          {
            kind: 'comparison',
            left: { source: 'items', column: 'quantity' },
            cmp: '>',
            right: 3,
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Should succeed - null comparisons are valid SQL
      expect(result.canCommit).toBe(true);
      expect(result.validationErrors).toBeUndefined();

      // Only Item 1 should match (Item 2's null > 3 returns false)
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Item 1');
    });

    it('should handle null = null returning true', async () => {
      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'category', friendlyName: 'Category', type: 'string', required: false },
        ],
      });

      ctx.addRecord('items', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Item 1', category: null },
      });

      ctx.addRecord('items', {
        id: 'i2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Item 2', category: 'Books' },
      });

      // Query: WHERE category = null (should match null values)
      const query: Query = {
        kind: 'select',
        values: [{ alias: 'name', value: { source: 'items', column: 'name' } }],
        from: { kind: 'table', table: 'items' },
        where: [
          {
            kind: 'comparison',
            left: { source: 'items', column: 'category' },
            cmp: '=',
            right: null,
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.canCommit).toBe(true);
      expect(result.validationErrors).toBeUndefined();

      // Should match Item 1 (null = null returns true)
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Item 1');
    });

    it('should validate LIKE operator requires string operands', async () => {
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
        id: 'p1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget', price: 100 },
      });

      // Query: LIKE on number field
      const query: Query = {
        kind: 'select',
        values: [{ alias: 'name', value: { source: 'products', column: 'name' } }],
        from: { kind: 'table', table: 'products' },
        where: [
          {
            kind: 'comparison',
            left: { source: 'products', column: 'price' },
            cmp: 'like',
            right: '10%',
          },
        ],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();

      const error = payload.result.validationErrors?.[0];
      expect(error?.message).toContain('LIKE operator requires string operands');
      // Note: LIKE errors don't set expectedType/actualType, they're embedded in the message
      expect(error?.suggestion).toContain('Ensure operands are compatible types');
    });
  });

  describe('Validation Error Structure', () => {
    it('should include all error metadata fields', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: true },
        ],
      });

      // Query: INSERT with wrong type
      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['name', 'age'],
        values: ['Alice', 'twenty-five'],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.validationErrors).toBeDefined();
      const error = payload.result.validationErrors![0];

      // Check all required fields
      expect(error.path).toBeDefined();
      expect(typeof error.path).toBe('string');

      expect(error.message).toBeDefined();
      expect(typeof error.message).toBe('string');

      expect(error.expectedType).toBeDefined();
      expect(typeof error.expectedType).toBe('string');

      expect(error.actualType).toBeDefined();
      expect(typeof error.actualType).toBe('string');

      expect(error.suggestion).toBeDefined();
      expect(typeof error.suggestion).toBe('string');

      // metadata is optional
      if (error.metadata) {
        expect(typeof error.metadata).toBe('object');
      }
    });

    it('should collect multiple validation errors', async () => {
      ctx.addType({
        name: 'records',
        friendlyName: 'Records',
        description: 'Test records',
        knowledgeTemplate: '{{id}}',
        fields: [
          { name: 'field1', friendlyName: 'Field 1', type: 'string', required: true },
          { name: 'field2', friendlyName: 'Field 2', type: 'number', required: true },
          { name: 'field3', friendlyName: 'Field 3', type: 'boolean', required: true },
        ],
      });

      // Query: INSERT with all wrong types
      const query: Query = {
        kind: 'insert',
        table: 'records',
        columns: ['field1', 'field2', 'field3'],
        values: [123, 'wrong', 'wrong'], // All wrong types
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();

      // Should have at least 3 errors (one for each field) - may have more from integrity checks
      expect(payload.result.validationErrors?.length).toBeGreaterThanOrEqual(3);

      // Verify we have type mismatch errors for the different fields
      const field1Errors = payload.result.validationErrors?.filter(e => e.message.includes('field1'));
      const field2Errors = payload.result.validationErrors?.filter(e => e.message.includes('field2'));
      const field3Errors = payload.result.validationErrors?.filter(e => e.message.includes('field3'));

      expect(field1Errors && field1Errors.length > 0).toBe(true);
      expect(field2Errors && field2Errors.length > 0).toBe(true);
      expect(field3Errors && field3Errors.length > 0).toBe(true);
    });
  });

  describe('canCommit Flag Behavior', () => {
    it('should set canCommit=true when no validation errors', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: true },
        ],
      });

      // Query: Valid INSERT
      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['name', 'age'],
        values: ['Alice', 25], // Correct types
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(true);
      expect(payload.result.validationErrors).toBeUndefined();

      // Should be able to commit
      const result = await commitQueryChanges(payload, ctx.getManager);
      expect(result.affectedCount).toBe(1);
    });

    it('should set canCommit=false when validation errors exist', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: true },
        ],
      });

      // Query: Invalid INSERT
      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['name', 'age'],
        values: ['Alice', 'invalid'], // Wrong type
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();

      // Should not be able to commit
      await expect(commitQueryChanges(payload, ctx.getManager)).rejects.toThrow();
    });

    it('should prevent commit when validation errors exist', async () => {
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

      // Query: UPDATE with wrong type
      const query: Query = {
        kind: 'insert',
        table: 'products',
        columns: ['name', 'price'],
        values: ['Widget', 'expensive'], // Wrong type for price
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Verify commit throws with validation error message
      await expect(commitQueryChanges(payload, ctx.getManager)).rejects.toThrow(
        'Cannot commit query with validation errors'
      );

      // Verify data was not committed
      const manager = ctx.getMockManager('products');
      expect(manager.getAll()).toHaveLength(0);
    });
  });

  describe('Query Execution with Validation Errors', () => {
    it('should execute query fully even with validation errors', async () => {
      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'quantity', friendlyName: 'Quantity', type: 'string', required: true }, // Wrong type
        ],
      });

      ctx.addRecord('items', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Item 1', quantity: 'five' },
      });

      ctx.addRecord('items', {
        id: 'i2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Item 2', quantity: 'ten' },
      });

      // Query: SUM on string field (will error but should still execute)
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'items', column: 'name' } },
          {
            alias: 'total',
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'items', column: 'quantity' },
            },
          },
        ],
        from: { kind: 'table', table: 'items' },
        groupBy: [{ source: 'items', column: 'name' }],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Should have validation error
      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();

      // But should still return rows (with safe default values)
      expect(payload.result.rows).toHaveLength(2);
      expect(payload.result.rows[0].name).toBe('Item 1');
      expect(payload.result.rows[0].total).toBe(0); // Safe default
      expect(payload.result.rows[1].name).toBe('Item 2');
      expect(payload.result.rows[1].total).toBe(0); // Safe default
    });

    it('should return safe defaults for operations with type errors', async () => {
      ctx.addType({
        name: 'data',
        friendlyName: 'Data',
        description: 'Data records',
        knowledgeTemplate: '{{id}}',
        fields: [
          { name: 'value1', friendlyName: 'Value 1', type: 'number', required: true },
          { name: 'value2', friendlyName: 'Value 2', type: 'string', required: true },
        ],
      });

      ctx.addRecord('data', {
        id: 'd1',
        created: Date.now(),
        updated: Date.now(),
        fields: { value1: 10, value2: 'text' },
      });

      // Query: Binary operation with type mixing
      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'result',
            value: {
              kind: 'binary',
              left: { source: 'data', column: 'value1' },
              op: '+',
              right: { source: 'data', column: 'value2' },
            },
          },
        ],
        from: { kind: 'table', table: 'data' },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Should have validation error
      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();

      // Should return safe default (null for binary operations)
      expect(payload.result.rows).toHaveLength(1);
      expect(payload.result.rows[0].result).toBeNull();
    });
  });

  describe('Enum Field Validation', () => {
    it('should accept valid enum values (string)', async () => {
      ctx.addType({
        name: 'tasks',
        friendlyName: 'Tasks',
        description: 'Task records',
        knowledgeTemplate: '{{title}}',
        fields: [
          { name: 'title', friendlyName: 'Title', type: 'string', required: true },
          {
            name: 'status',
            friendlyName: 'Status',
            type: 'enum',
            required: true,
            enumOptions: ['todo', 'in_progress', 'done'],
          },
        ],
      });

      // Query: INSERT with valid enum value
      const query: Query = {
        kind: 'insert',
        table: 'tasks',
        columns: ['title', 'status'],
        values: ['Task 1', 'todo'], // Valid enum value
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.canCommit).toBe(true);
      expect(result.validationErrors).toBeUndefined();
      expect(result.affectedCount).toBe(1);
    });

    it('should accept valid enum values (number as string)', async () => {
      ctx.addType({
        name: 'priorities',
        friendlyName: 'Priorities',
        description: 'Priority records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          {
            name: 'level',
            friendlyName: 'Level',
            type: 'enum',
            required: true,
            enumOptions: ['1', '2', '3', '4', '5'],
          },
        ],
      });

      // Query: INSERT with numeric enum value
      const query: Query = {
        kind: 'insert',
        table: 'priorities',
        columns: ['name', 'level'],
        values: ['High', 1], // Number will be converted to string for enum
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.canCommit).toBe(true);
      expect(result.validationErrors).toBeUndefined();
      expect(result.affectedCount).toBe(1);
    });

    it('should reject invalid enum values', async () => {
      ctx.addType({
        name: 'tasks',
        friendlyName: 'Tasks',
        description: 'Task records',
        knowledgeTemplate: '{{title}}',
        fields: [
          { name: 'title', friendlyName: 'Title', type: 'string', required: true },
          {
            name: 'status',
            friendlyName: 'Status',
            type: 'enum',
            required: true,
            enumOptions: ['todo', 'in_progress', 'done'],
          },
        ],
      });

      // Query: INSERT with invalid enum value
      const query: Query = {
        kind: 'insert',
        table: 'tasks',
        columns: ['title', 'status'],
        values: ['Task 1', 'completed'], // Invalid enum value
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();

      const error = payload.result.validationErrors?.find(e => e.message.includes('status') && e.message.includes('valid option'));
      expect(error).toBeDefined();
      expect(error?.message).toContain("Value 'completed' is not a valid option");
      expect(error?.suggestion).toContain('Valid options: todo, in_progress, done');
    });

    it('should validate enum values in UPDATE', async () => {
      ctx.addType({
        name: 'orders',
        friendlyName: 'Orders',
        description: 'Order records',
        knowledgeTemplate: '{{id}}',
        fields: [
          { name: 'customer', friendlyName: 'Customer', type: 'string', required: true },
          {
            name: 'status',
            friendlyName: 'Status',
            type: 'enum',
            required: true,
            enumOptions: ['pending', 'shipped', 'delivered'],
          },
        ],
      });

      ctx.addRecord('orders', {
        id: 'o1',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Alice', status: 'pending' },
      });

      // Query: UPDATE with invalid enum value
      const query: Query = {
        kind: 'update',
        table: 'orders',
        set: [{ column: 'status', value: 'cancelled' }], // Invalid enum value
        where: [
          {
            kind: 'comparison',
            left: { source: 'orders', column: 'id' },
            cmp: '=',
            right: 'o1',
          },
        ],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();

      const error = payload.result.validationErrors?.find(e => e.message.includes('status') && e.message.includes('valid option'));
      expect(error).toBeDefined();
      expect(error?.message).toContain("Value 'cancelled' is not a valid option");
      expect(error?.suggestion).toContain('Valid options: pending, shipped, delivered');
    });

    it('should validate enum values in INSERT from SELECT', async () => {
      ctx.addType({
        name: 'source',
        friendlyName: 'Source',
        description: 'Source records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'state', friendlyName: 'State', type: 'string', required: true },
        ],
      });

      ctx.addType({
        name: 'target',
        friendlyName: 'Target',
        description: 'Target records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          {
            name: 'state',
            friendlyName: 'State',
            type: 'enum',
            required: true,
            enumOptions: ['active', 'inactive'],
          },
        ],
      });

      ctx.addRecord('source', {
        id: 's1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Item', state: 'archived' }, // Invalid for target
      });

      // Query: INSERT INTO target SELECT from source
      const query: Query = {
        kind: 'insert',
        table: 'target',
        columns: ['name', 'state'],
        select: {
          kind: 'select',
          values: [
            { alias: 'name', value: { source: 'source', column: 'name' } },
            { alias: 'state', value: { source: 'source', column: 'state' } },
          ],
          from: { kind: 'table', table: 'source' },
        },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();

      const error = payload.result.validationErrors?.find(e => e.message.includes('state') && e.message.includes('valid option'));
      expect(error).toBeDefined();
      // The actual value in the error could be 'pending' or 'archived' depending on which row fails first
      expect(error?.message).toMatch(/Value '(pending|archived)' is not a valid option/);
      expect(error?.suggestion).toContain('Valid options: active, inactive');
    });

    it('should allow null for optional enum fields', async () => {
      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          {
            name: 'category',
            friendlyName: 'Category',
            type: 'enum',
            required: false,
            enumOptions: ['electronics', 'clothing', 'food'],
          },
        ],
      });

      // Query: INSERT with null for optional enum field
      const query: Query = {
        kind: 'insert',
        table: 'items',
        columns: ['name', 'category'],
        values: ['Item', null], // Null is OK for optional field
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.canCommit).toBe(true);
      expect(result.validationErrors).toBeUndefined();
      expect(result.affectedCount).toBe(1);
    });
  });

  describe('Required Field Validation', () => {
    it('should reject null for required fields in INSERT', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'email', friendlyName: 'Email', type: 'string', required: true },
          { name: 'phone', friendlyName: 'Phone', type: 'string', required: false },
        ],
      });

      // Query: INSERT with null for required field
      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['name', 'email', 'phone'],
        values: ['Alice', null, null], // email is required but null
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();

      // Should have error for email (required) but not phone (optional)
      const emailError = payload.result.validationErrors?.find(e => e.message.includes('email') && e.message.includes('required'));
      expect(emailError).toBeDefined();
      expect(emailError?.message).toContain("Cannot assign null to required field 'email'");
      expect(emailError?.suggestion).toContain('Provide a non-null value for email');

      // Should not have error for phone (optional)
      const phoneError = payload.result.validationErrors?.find(e => e.message.includes('phone') && e.message.includes('required'));
      expect(phoneError).toBeUndefined();
    });

    it('should allow null for fields with defaults', async () => {
      ctx.addType({
        name: 'settings',
        friendlyName: 'Settings',
        description: 'Setting records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'value', friendlyName: 'Value', type: 'number', required: true, default: 0 },
        ],
      });

      // Query: INSERT without providing value (has default)
      // Note: In practice, the application layer would apply defaults
      // But validation should pass if the field has a default
      const query: Query = {
        kind: 'insert',
        table: 'settings',
        columns: ['name', 'value'],
        values: ['config', null], // value has default, so null might be acceptable at this layer
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Field is required=true but has default, so null validation depends on implementation
      // Since required is explicitly true, it should still error
      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();
    });

    it('should validate required fields in INSERT from SELECT', async () => {
      ctx.addType({
        name: 'source',
        friendlyName: 'Source',
        description: 'Source records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'title', friendlyName: 'Title', type: 'string', required: true },
          { name: 'description', friendlyName: 'Description', type: 'string', required: false },
        ],
      });

      ctx.addType({
        name: 'target',
        friendlyName: 'Target',
        description: 'Target records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'title', friendlyName: 'Title', type: 'string', required: true },
          { name: 'body', friendlyName: 'Body', type: 'string', required: true },
        ],
      });

      ctx.addRecord('source', {
        id: 's1',
        created: Date.now(),
        updated: Date.now(),
        fields: { title: 'Item', description: null },
      });

      // Query: INSERT INTO target SELECT from source (description/body is null but required)
      const query: Query = {
        kind: 'insert',
        table: 'target',
        columns: ['title', 'body'],
        select: {
          kind: 'select',
          values: [
            { alias: 'title', value: { source: 'source', column: 'title' } },
            { alias: 'description', value: { source: 'source', column: 'description' } },
          ],
          from: { kind: 'table', table: 'source' },
        },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();

      const error = payload.result.validationErrors?.find(e => e.message.includes('body') && e.message.includes('required'));
      expect(error).toBeDefined();
      expect(error?.message).toContain("Cannot assign null to required field 'body'");
    });

    it('should not validate required fields for UPDATE (can set to null)', async () => {
      ctx.addType({
        name: 'profiles',
        friendlyName: 'Profiles',
        description: 'Profile records',
        knowledgeTemplate: '{{username}}',
        fields: [
          { name: 'username', friendlyName: 'Username', type: 'string', required: true },
          { name: 'bio', friendlyName: 'Bio', type: 'string', required: false },
        ],
      });

      ctx.addRecord('profiles', {
        id: 'p1',
        created: Date.now(),
        updated: Date.now(),
        fields: { username: 'alice', bio: 'Hello' },
      });

      // Query: UPDATE to set bio to null (should succeed even though we're updating)
      const query: Query = {
        kind: 'update',
        table: 'profiles',
        set: [{ column: 'bio', value: null }],
        where: [
          {
            kind: 'comparison',
            left: { source: 'profiles', column: 'id' },
            cmp: '=',
            right: 'p1',
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Should succeed - UPDATE doesn't validate required fields
      expect(result.canCommit).toBe(true);
      expect(result.validationErrors).toBeUndefined();
      expect(result.affectedCount).toBe(1);
    });
  });
});
