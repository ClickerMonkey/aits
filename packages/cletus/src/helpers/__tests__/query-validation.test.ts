/**
 * Comprehensive validation tests for DBA query system
 * Covers ALL validation test cases in query.ts including:
 * - Value type validation (isAssignableTo)
 * - Column existence validation
 * - Binary operation type checking
 * - Comparison type checking
 * - Division by zero
 * - Unary operation type checking
 * - Aggregate function type checking
 * - Function argument validation
 * - INSERT validation (column count, column existence, type assignment)
 * - UPDATE validation (column existence, type assignment)
 * - Foreign key validation
 * - Enum validation
 * - Required field validation
 * - ON DELETE cascade validation
 */

import type { Query } from '../dba';
import { commitQueryChanges, executeQueryWithoutCommit } from '../query';
import { TestContext } from './test-helpers';

describe('DBA Query Validation - Comprehensive', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = new TestContext();
  });

  // ========================================================================
  // VALUE TYPE VALIDATION (Value.isAssignableTo)
  // ========================================================================

  describe('Value.isAssignableTo - Null Handling', () => {
    it('should reject null for required fields', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        ],
      });

      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['name'],
        values: [null],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors).toBeDefined();
      expect(payload.result.validationErrors?.[0].message).toContain("Cannot assign null to required field 'name'");
      expect(payload.result.validationErrors?.[0].expectedType).toBe('string');
      expect(payload.result.validationErrors?.[0].actualType).toBe('null');
    });

    it('should allow null for optional fields', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'nickname', friendlyName: 'Nickname', type: 'string', required: false },
        ],
      });

      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['nickname'],
        values: [null],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(true);
      expect(payload.result.validationErrors).toBeUndefined();
    });
  });

  describe('Value.isAssignableTo - Enum Validation', () => {
    it('should reject invalid enum values', async () => {
      ctx.addType({
        name: 'orders',
        friendlyName: 'Orders',
        description: 'Order records',
        knowledgeTemplate: '{{status}}',
        fields: [
          {
            name: 'status',
            friendlyName: 'Status',
            type: 'string',
            required: true,
            enumOptions: ['pending', 'shipped', 'delivered'],
          },
        ],
      });

      const query: Query = {
        kind: 'insert',
        table: 'orders',
        columns: ['status'],
        values: ['invalid_status'],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain("Value 'invalid_status' is not a valid option for enum field 'status'");
      expect(payload.result.validationErrors?.[0].expectedType).toBe('pending | shipped | delivered');
      expect(payload.result.validationErrors?.[0].suggestion).toContain('Valid options: pending, shipped, delivered');
    });

    it('should accept valid enum values', async () => {
      ctx.addType({
        name: 'orders',
        friendlyName: 'Orders',
        description: 'Order records',
        knowledgeTemplate: '{{status}}',
        fields: [
          {
            name: 'status',
            friendlyName: 'Status',
            type: 'string',
            required: true,
            enumOptions: ['pending', 'shipped', 'delivered'],
          },
        ],
      });

      const query: Query = {
        kind: 'insert',
        table: 'orders',
        columns: ['status'],
        values: ['pending'],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(true);
    });
  });

  describe('Value.isAssignableTo - Foreign Key Validation', () => {
    it('should reject non-string values for foreign key fields', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      ctx.addType({
        name: 'posts',
        friendlyName: 'Posts',
        description: 'Post records',
        knowledgeTemplate: '{{title}}',
        fields: [
          { name: 'title', friendlyName: 'Title', type: 'string', required: true },
          { name: 'author', friendlyName: 'Author', type: 'users', required: true },
        ],
      });

      const query: Query = {
        kind: 'insert',
        table: 'posts',
        columns: ['title', 'author'],
        values: ['My Post', 123], // number instead of string ID
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain("Foreign key field 'author' expects a string ID, got number");
      expect(payload.result.validationErrors?.[0].expectedType).toBe('string');
      expect(payload.result.validationErrors?.[0].actualType).toBe('number');
    });
  });

  describe('Value.isAssignableTo - Type Mismatch', () => {
    it('should reject number assigned to string field', async () => {
      ctx.addType({
        name: 'products',
        friendlyName: 'Products',
        description: 'Product records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      const query: Query = {
        kind: 'insert',
        table: 'products',
        columns: ['name'],
        values: [42],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain("Cannot assign number to string field 'name'");
      expect(payload.result.validationErrors?.[0].expectedType).toBe('string');
      expect(payload.result.validationErrors?.[0].actualType).toBe('number');
    });

    it('should reject string assigned to number field', async () => {
      ctx.addType({
        name: 'products',
        friendlyName: 'Products',
        description: 'Product records',
        knowledgeTemplate: '{{price}}',
        fields: [{ name: 'price', friendlyName: 'Price', type: 'number', required: true }],
      });

      const query: Query = {
        kind: 'insert',
        table: 'products',
        columns: ['price'],
        values: ['not a number'],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain("Cannot assign string to number field 'price'");
    });

    it('should reject string assigned to boolean field', async () => {
      ctx.addType({
        name: 'settings',
        friendlyName: 'Settings',
        description: 'Settings records',
        knowledgeTemplate: '{{enabled}}',
        fields: [{ name: 'enabled', friendlyName: 'Enabled', type: 'boolean', required: true }],
      });

      const query: Query = {
        kind: 'insert',
        table: 'settings',
        columns: ['enabled'],
        values: ['true'], // string instead of boolean
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain("Cannot assign string to boolean field 'enabled'");
    });
  });

  // ========================================================================
  // COLUMN VALIDATION (SourceColumnExpr)
  // ========================================================================

  describe('Column Existence Validation', () => {
    it('should detect non-existent column in SELECT', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      ctx.addRecord('users', {
        id: 'u1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      const query: Query = {
        kind: 'select',
        values: [{ alias: 'col', value: { source: 'users', column: 'nonexistent' } }],
        from: { kind: 'table', table: 'users' },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain("Column 'nonexistent' does not exist on type 'users'");
      expect(payload.result.validationErrors?.[0].message).toContain('Valid columns: id, created, updated, name');
    });
  });

  // ========================================================================
  // BINARY OPERATION VALIDATION (BinaryExpr)
  // ========================================================================

  describe('Binary Operation Type Checking', () => {
    it('should detect type mismatch in binary operations', async () => {
      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'count', friendlyName: 'Count', type: 'number', required: true },
        ],
      });

      ctx.addRecord('items', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget', count: 10 },
      });

      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'result',
            value: {
              kind: 'binary',
              left: { source: 'items', column: 'count' },
              op: '+',
              right: { source: 'items', column: 'name' },
            },
          },
        ],
        from: { kind: 'table', table: 'items' },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain("Cannot perform '+' on number and string");
      expect(payload.result.validationErrors?.[0].metadata?.operator).toBe('+');
    });

    it('should handle division by zero', async () => {
      ctx.addType({
        name: 'numbers',
        friendlyName: 'Numbers',
        description: 'Number records',
        knowledgeTemplate: '{{value}}',
        fields: [{ name: 'value', friendlyName: 'Value', type: 'number', required: true }],
      });

      ctx.addRecord('numbers', {
        id: 'n1',
        created: Date.now(),
        updated: Date.now(),
        fields: { value: 10 },
      });

      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'result',
            value: {
              kind: 'binary',
              left: { source: 'numbers', column: 'value' },
              op: '/',
              right: 0,
            },
          },
        ],
        from: { kind: 'table', table: 'numbers' },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toBe('Division by zero');
      expect(payload.result.validationErrors?.[0].suggestion).toBe('Ensure denominator is not zero');
    });

    it('should handle NULL in binary operations (SQL semantics)', async () => {
      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{value}}',
        fields: [{ name: 'value', friendlyName: 'Value', type: 'number', required: false }],
      });

      ctx.addRecord('items', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { value: null },
      });

      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'result',
            value: {
              kind: 'binary',
              left: { source: 'items', column: 'value' },
              op: '+',
              right: 10,
            },
          },
        ],
        from: { kind: 'table', table: 'items' },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // NULL in binary operations should return NULL, no error
      expect(payload.result.canCommit).toBe(true);
      expect(payload.result.rows[0].result).toBeNull();
    });
  });

  // ========================================================================
  // UNARY OPERATION VALIDATION (UnaryExpr)
  // ========================================================================

  describe('Unary Operation Type Checking', () => {
    it('should detect non-numeric operand for unary minus', async () => {
      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      ctx.addRecord('items', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget' },
      });

      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'result',
            value: {
              kind: 'unary',
              unary: '-',
              value: { source: 'items', column: 'name' },
            },
          },
        ],
        from: { kind: 'table', table: 'items' },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain('Unary minus requires a number, got string');
      expect(payload.result.validationErrors?.[0].expectedType).toBe('number');
      expect(payload.result.validationErrors?.[0].actualType).toBe('string');
    });
  });

  // ========================================================================
  // COMPARISON VALIDATION (ComparisonExpr)
  // ========================================================================

  describe('Comparison Type Checking', () => {
    it('should detect incompatible types in comparison', async () => {
      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'count', friendlyName: 'Count', type: 'number', required: true },
        ],
      });

      ctx.addRecord('items', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget', count: 10 },
      });

      const query: Query = {
        kind: 'select',
        values: [{ alias: 'name', value: { source: 'items', column: 'name' } }],
        from: { kind: 'table', table: 'items' },
        where: [
          {
            kind: 'comparison',
            left: { source: 'items', column: 'count' },
            cmp: '=',
            right: { source: 'items', column: 'name' },
          },
        ],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain('Cannot compare number with string');
    });

    it('should detect LIKE operator on non-string operands', async () => {
      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{count}}',
        fields: [{ name: 'count', friendlyName: 'Count', type: 'number', required: true }],
      });

      ctx.addRecord('items', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { count: 10 },
      });

      const query: Query = {
        kind: 'select',
        values: [{ alias: 'count', value: { source: 'items', column: 'count' } }],
        from: { kind: 'table', table: 'items' },
        where: [
          {
            kind: 'comparison',
            left: { source: 'items', column: 'count' },
            cmp: 'like',
            right: '10%',
          },
        ],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain('LIKE operator requires string operands');
    });
  });

  // ========================================================================
  // AGGREGATE VALIDATION (AggregateExpr)
  // ========================================================================

  describe('Aggregate Function Type Checking', () => {
    it('should detect non-numeric values in SUM', async () => {
      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      ctx.addRecord('items', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget' },
      });

      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'total',
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'items', column: 'name' },
            },
          },
        ],
        from: { kind: 'table', table: 'items' },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain('SUM requires numeric values, found string');
      expect(payload.result.validationErrors?.[0].expectedType).toBe('number');
      expect(payload.result.validationErrors?.[0].actualType).toBe('string');
    });

    it('should detect non-numeric values in AVG', async () => {
      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      ctx.addRecord('items', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget' },
      });

      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'avg',
            value: {
              kind: 'aggregate',
              aggregate: 'avg',
              value: { source: 'items', column: 'name' },
            },
          },
        ],
        from: { kind: 'table', table: 'items' },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain('AVG requires numeric values');
    });
  });

  // ========================================================================
  // FUNCTION VALIDATION (FunctionCallExpr)
  // ========================================================================

  describe('Function Argument Validation', () => {
    it('should validate exact argument count for substring', async () => {
      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      ctx.addRecord('items', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget' },
      });

      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'result',
            value: {
              kind: 'function',
              function: 'substring',
              args: ['test'], // Missing start parameter
            },
          },
        ],
        from: { kind: 'table', table: 'items' },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain('substring requires at least 2');
    });

    it('should validate argument types for abs function', async () => {
      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      ctx.addRecord('items', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget' },
      });

      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'result',
            value: {
              kind: 'function',
              function: 'abs',
              args: ['not a number'],
            },
          },
        ],
        from: { kind: 'table', table: 'items' },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain('abs() argument 1 expects number, got string');
      expect(payload.result.validationErrors?.[0].expectedType).toBe('number');
    });

    it('should validate exact argument count for replace', async () => {
      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      ctx.addRecord('items', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget' },
      });

      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'result',
            value: {
              kind: 'function',
              function: 'replace',
              args: ['test', 'pattern'], // Missing replacement parameter
            },
          },
        ],
        from: { kind: 'table', table: 'items' },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain('replace requires 3 arguments');
    });

    it('should validate exact argument count for nullif', async () => {
      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      ctx.addRecord('items', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget' },
      });

      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'result',
            value: {
              kind: 'function',
              function: 'nullif',
              args: ['single'], // Missing second argument
            },
          },
        ],
        from: { kind: 'table', table: 'items' },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain('nullif requires 2 arguments');
    });
  });

  // ========================================================================
  // INSERT VALIDATION (InsertExpr)
  // ========================================================================

  describe('INSERT Statement Validation', () => {
    it('should detect table does not exist', async () => {
      const query: Query = {
        kind: 'insert',
        table: 'nonexistent',
        columns: ['name'],
        values: ['test'],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain("Table 'nonexistent' does not exist");
    });

    it('should detect column count mismatch', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['name'],
        values: ['Alice', 'Bob'], // 2 values for 1 column
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain('Column count (1) != value count (2)');
    });

    it('should detect non-existent column in INSERT', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['nonexistent'],
        values: ['Alice'],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain("Column 'nonexistent' does not exist on table 'users'");
      expect(payload.result.validationErrors?.[0].suggestion).toContain('Available columns: name');
    });

    it('should validate INSERT values against field types', async () => {
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

      const query: Query = {
        kind: 'insert',
        table: 'products',
        columns: ['name', 'price'],
        values: ['Widget', 'not a number'],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain("Cannot assign string to number field 'price'");
    });

    it('should validate ON CONFLICT UPDATE values', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{email}}',
        fields: [
          { name: 'email', friendlyName: 'Email', type: 'string', required: true },
          { name: 'age', friendlyName: 'Age', type: 'number', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: 'u1',
        created: Date.now(),
        updated: Date.now(),
        fields: { email: 'test@example.com', age: 30 },
      });

      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['email', 'age'],
        values: ['test@example.com', 25],
        onConflict: {
          columns: ['email'],
          update: [{ column: 'age', value: 'not a number' }],
        },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain("Cannot assign string to number field 'age'");
    });
  });

  // ========================================================================
  // UPDATE VALIDATION (UpdateExpr)
  // ========================================================================

  describe('UPDATE Statement Validation', () => {
    it('should detect table does not exist in UPDATE', async () => {
      const query: Query = {
        kind: 'update',
        table: 'nonexistent',
        set: [{ column: 'name', value: 'test' }],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain("Table 'nonexistent' does not exist");
    });

    it('should detect non-existent column in UPDATE', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      ctx.addRecord('users', {
        id: 'u1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      const query: Query = {
        kind: 'update',
        table: 'users',
        set: [{ column: 'nonexistent', value: 'test' }],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain("Column 'nonexistent' does not exist on table 'users'");
      expect(payload.result.validationErrors?.[0].suggestion).toContain('Available columns: name');
    });

    it('should validate UPDATE values against field types', async () => {
      ctx.addType({
        name: 'products',
        friendlyName: 'Products',
        description: 'Product records',
        knowledgeTemplate: '{{price}}',
        fields: [{ name: 'price', friendlyName: 'Price', type: 'number', required: true }],
      });

      ctx.addRecord('products', {
        id: 'p1',
        created: Date.now(),
        updated: Date.now(),
        fields: { price: 100 },
      });

      const query: Query = {
        kind: 'update',
        table: 'products',
        set: [{ column: 'price', value: 'not a number' }],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain("Cannot assign string to number field 'price'");
    });
  });

  // ========================================================================
  // REFERENCE INTEGRITY VALIDATION
  // ========================================================================

  describe('Reference Integrity Validation', () => {
    it('should detect foreign key violation on INSERT', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      ctx.addType({
        name: 'posts',
        friendlyName: 'Posts',
        description: 'Post records',
        knowledgeTemplate: '{{title}}',
        fields: [
          { name: 'title', friendlyName: 'Title', type: 'string', required: true },
          { name: 'author', friendlyName: 'Author', type: 'users', required: true },
        ],
      });

      const query: Query = {
        kind: 'insert',
        table: 'posts',
        columns: ['title', 'author'],
        values: ['My Post', 'nonexistent_user_id'],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain('Foreign key violation');
      expect(payload.result.validationErrors?.[0].message).toContain("references non-existent users record 'nonexistent_user_id'");
    });

    it('should allow valid foreign key reference', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      ctx.addType({
        name: 'posts',
        friendlyName: 'Posts',
        description: 'Post records',
        knowledgeTemplate: '{{title}}',
        fields: [
          { name: 'title', friendlyName: 'Title', type: 'string', required: true },
          { name: 'author', friendlyName: 'Author', type: 'users', required: true },
        ],
      });

      ctx.addRecord('users', {
        id: 'u1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      const query: Query = {
        kind: 'insert',
        table: 'posts',
        columns: ['title', 'author'],
        values: ['My Post', 'u1'],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(true);
    });

    it('should detect required field is null', async () => {
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

      const query: Query = {
        kind: 'insert',
        table: 'users',
        columns: ['name', 'email'],
        values: ['Alice', null],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain("Cannot assign null to required field 'email'");
    });

    it('should validate enum values in reference integrity check', async () => {
      ctx.addType({
        name: 'orders',
        friendlyName: 'Orders',
        description: 'Order records',
        knowledgeTemplate: '{{status}}',
        fields: [
          {
            name: 'status',
            friendlyName: 'Status',
            type: 'string',
            required: true,
            enumOptions: ['pending', 'shipped', 'delivered'],
          },
        ],
      });

      const query: Query = {
        kind: 'insert',
        table: 'orders',
        columns: ['status'],
        values: ['invalid_status'],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain("Value 'invalid_status' is not a valid option");
    });
  });

  // ========================================================================
  // ON DELETE CASCADE VALIDATION
  // ========================================================================

  describe('ON DELETE Cascade Validation', () => {
    it('should detect restrict violation on delete', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      ctx.addType({
        name: 'posts',
        friendlyName: 'Posts',
        description: 'Post records',
        knowledgeTemplate: '{{title}}',
        fields: [
          { name: 'title', friendlyName: 'Title', type: 'string', required: true },
          { name: 'author', friendlyName: 'Author', type: 'users', required: true, onDelete: 'restrict' },
        ],
      });

      ctx.addRecord('users', {
        id: 'u1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      ctx.addRecord('posts', {
        id: 'p1',
        created: Date.now(),
        updated: Date.now(),
        fields: { title: 'Post 1', author: 'u1' },
      });

      const query: Query = {
        kind: 'delete',
        table: 'users',
        where: [
          {
            kind: 'comparison',
            left: { source: 'users', column: 'id' },
            cmp: '=',
            right: 'u1',
          },
        ],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);
      expect(payload.result.validationErrors?.[0].message).toContain("Cannot delete users record 'u1': referenced by posts.author");
    });

    it('should handle cascade delete', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      ctx.addType({
        name: 'posts',
        friendlyName: 'Posts',
        description: 'Post records',
        knowledgeTemplate: '{{title}}',
        fields: [
          { name: 'title', friendlyName: 'Title', type: 'string', required: true },
          { name: 'author', friendlyName: 'Author', type: 'users', required: true, onDelete: 'cascade' },
        ],
      });

      ctx.addRecord('users', {
        id: 'u1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      ctx.addRecord('posts', {
        id: 'p1',
        created: Date.now(),
        updated: Date.now(),
        fields: { title: 'Post 1', author: 'u1' },
      });

      const query: Query = {
        kind: 'delete',
        table: 'users',
        where: [
          {
            kind: 'comparison',
            left: { source: 'users', column: 'id' },
            cmp: '=',
            right: 'u1',
          },
        ],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Should cascade delete the post
      expect(payload.result.canCommit).toBe(true);
      expect(payload.deltas).toHaveLength(2); // users and posts
    });

    it('should handle set null on delete', async () => {
      ctx.addType({
        name: 'users',
        friendlyName: 'Users',
        description: 'User records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      ctx.addType({
        name: 'posts',
        friendlyName: 'Posts',
        description: 'Post records',
        knowledgeTemplate: '{{title}}',
        fields: [
          { name: 'title', friendlyName: 'Title', type: 'string', required: true },
          { name: 'author', friendlyName: 'Author', type: 'users', required: false, onDelete: 'setNull' },
        ],
      });

      ctx.addRecord('users', {
        id: 'u1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      ctx.addRecord('posts', {
        id: 'p1',
        created: Date.now(),
        updated: Date.now(),
        fields: { title: 'Post 1', author: 'u1' },
      });

      const query: Query = {
        kind: 'delete',
        table: 'users',
        where: [
          {
            kind: 'comparison',
            left: { source: 'users', column: 'id' },
            cmp: '=',
            right: 'u1',
          },
        ],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Should set author to null
      expect(payload.result.canCommit).toBe(true);
      expect(payload.deltas).toHaveLength(2); // users (delete) and posts (update)
    });
  });

  // ========================================================================
  // VALIDATION ERROR STRUCTURE
  // ========================================================================

  describe('Validation Error Structure', () => {
    it('should include path in validation errors', async () => {
      ctx.addType({
        name: 'products',
        friendlyName: 'Products',
        description: 'Product records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      const query: Query = {
        kind: 'insert',
        table: 'products',
        columns: ['name'],
        values: [null],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.validationErrors?.[0].path).toBeDefined();
      // Path starts with 'query' as the root path
      expect(payload.result.validationErrors?.[0].path).toContain('values');
    });

    it('should include expectedType and actualType when applicable', async () => {
      ctx.addType({
        name: 'products',
        friendlyName: 'Products',
        description: 'Product records',
        knowledgeTemplate: '{{price}}',
        fields: [{ name: 'price', friendlyName: 'Price', type: 'number', required: true }],
      });

      const query: Query = {
        kind: 'insert',
        table: 'products',
        columns: ['price'],
        values: ['not a number'],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.validationErrors?.[0].expectedType).toBe('number');
      expect(payload.result.validationErrors?.[0].actualType).toBe('string');
    });

    it('should include suggestion in validation errors', async () => {
      ctx.addType({
        name: 'products',
        friendlyName: 'Products',
        description: 'Product records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      const query: Query = {
        kind: 'insert',
        table: 'products',
        columns: ['name'],
        values: [null],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.validationErrors?.[0].suggestion).toBeDefined();
      expect(payload.result.validationErrors?.[0].suggestion).toContain('Provide a non-null value');
    });

    it('should include metadata in validation errors', async () => {
      ctx.addType({
        name: 'items',
        friendlyName: 'Items',
        description: 'Item records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'count', friendlyName: 'Count', type: 'number', required: true },
        ],
      });

      ctx.addRecord('items', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget', count: 10 },
      });

      const query: Query = {
        kind: 'select',
        values: [
          {
            alias: 'result',
            value: {
              kind: 'binary',
              left: { source: 'items', column: 'count' },
              op: '+',
              right: { source: 'items', column: 'name' },
            },
          },
        ],
        from: { kind: 'table', table: 'items' },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.validationErrors?.[0].metadata).toBeDefined();
      expect(payload.result.validationErrors?.[0].metadata?.operator).toBe('+');
    });
  });

  // ========================================================================
  // COMMIT BEHAVIOR WITH VALIDATION ERRORS
  // ========================================================================

  describe('Commit Behavior with Validation Errors', () => {
    it('should prevent commit when validation errors exist', async () => {
      ctx.addType({
        name: 'products',
        friendlyName: 'Products',
        description: 'Product records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      const query: Query = {
        kind: 'insert',
        table: 'products',
        columns: ['name'],
        values: [null],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(false);

      await expect(commitQueryChanges(payload, ctx.getManager)).rejects.toThrow(
        'Cannot commit query with validation errors'
      );
    });

    it('should allow commit when no validation errors exist', async () => {
      ctx.addType({
        name: 'products',
        friendlyName: 'Products',
        description: 'Product records',
        knowledgeTemplate: '{{name}}',
        fields: [{ name: 'name', friendlyName: 'Name', type: 'string', required: true }],
      });

      const query: Query = {
        kind: 'insert',
        table: 'products',
        columns: ['name'],
        values: ['Widget'],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.canCommit).toBe(true);
      expect(payload.result.validationErrors).toBeUndefined();

      // Should not throw
      await expect(commitQueryChanges(payload, ctx.getManager)).resolves.toBeDefined();
    });
  });
});
