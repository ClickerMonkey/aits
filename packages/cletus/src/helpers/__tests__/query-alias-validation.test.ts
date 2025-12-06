/**
 * Tests for alias uniqueness validation
 * Ensures that:
 * - CTE names are unique across all CTEs
 * - Source aliases (FROM, JOINs, main table) are unique within a statement
 * - Final statement aliases don't conflict with CTE names
 */

import { executeQueryWithoutCommit } from '../query';
import type { Query } from '../dba';
import { TestContext } from './test-helpers';

describe('Alias uniqueness validation', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = new TestContext();

    // Setup common tables
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
      knowledgeTemplate: '{{name}}',
      fields: [
        { name: 'name', friendlyName: 'Name', type: 'string', required: true },
      ],
    });
  });

  describe('Duplicate CTE names', () => {
    it('should reject duplicate CTE names', async () => {
      const query: Query = {
        kind: 'withs',
        withs: [
          {
            kind: 'cte',
            name: 'user_data',
            statement: {
              kind: 'select',
              values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
              from: { kind: 'table', table: 'users' },
            },
          },
          {
            kind: 'cte',
            name: 'user_data', // DUPLICATE!
            statement: {
              kind: 'select',
              values: [{ alias: 'name', value: { source: 'departments', column: 'name' } }],
              from: { kind: 'table', table: 'departments' },
            },
          },
        ],
        final: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'user_data', column: 'name' } }],
          from: { kind: 'table', table: 'user_data' },
        },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.validationErrors).toBeDefined();
      const duplicateCteError = payload.result.validationErrors?.find(e =>
        e.message.includes("Duplicate CTE name 'user_data'")
      );
      expect(duplicateCteError).toBeDefined();
    });

    it('should allow same CTE name in different case (normalized to lowercase)', async () => {
      const query: Query = {
        kind: 'withs',
        withs: [
          {
            kind: 'cte',
            name: 'UserData',
            statement: {
              kind: 'select',
              values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
              from: { kind: 'table', table: 'users' },
            },
          },
          {
            kind: 'cte',
            name: 'userdata', // Same as UserData when normalized
            statement: {
              kind: 'select',
              values: [{ alias: 'name', value: { source: 'departments', column: 'name' } }],
              from: { kind: 'table', table: 'departments' },
            },
          },
        ],
        final: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'UserData', column: 'name' } }],
          from: { kind: 'table', table: 'UserData' },
        },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.validationErrors).toBeDefined();
      const duplicateCteError = payload.result.validationErrors?.find(e =>
        e.message.includes('Duplicate CTE name')
      );
      expect(duplicateCteError).toBeDefined();
    });
  });

  describe('Duplicate source aliases in SELECT', () => {
    it('should reject duplicate explicit aliases in JOINs', async () => {
      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'user_name', value: { source: 'u', column: 'name' } },
        ],
        from: { kind: 'aliased', table: 'users', as: 'u' },
        joins: [
          {
            source: { kind: 'aliased', table: 'departments', as: 'u' }, // DUPLICATE alias 'u'!
            type: 'inner',
            on: [
              {
                kind: 'comparison',
                left: { source: 'u', column: 'id' },
                cmp: '=',
                right: '1',
              },
            ],
          },
        ],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.validationErrors).toBeDefined();
      const duplicateAliasError = payload.result.validationErrors?.find(e =>
        e.message.includes("Duplicate source alias 'u'")
      );
      expect(duplicateAliasError).toBeDefined();
    });

    it('should reject duplicate implicit aliases (table names)', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'user_name', value: { source: 'users', column: 'name' } },
          { alias: 'dept_name', value: { source: 'departments', column: 'name' } },
        ],
        from: { kind: 'table', table: 'users' }, // Implicit alias: 'users'
        joins: [
          {
            source: { kind: 'table', table: 'users' }, // DUPLICATE implicit alias 'users'!
            type: 'inner',
            on: [
              {
                kind: 'comparison',
                left: { source: 'users', column: 'id' },
                cmp: '=',
                right: '1',
              },
            ],
          },
        ],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.validationErrors).toBeDefined();
      const duplicateAliasError = payload.result.validationErrors?.find(e =>
        e.message.includes("Duplicate source alias 'users'")
      );
      expect(duplicateAliasError).toBeDefined();
    });

    it('should allow same table with different explicit aliases', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name1', value: { source: 'u1', column: 'name' } },
          { alias: 'name2', value: { source: 'u2', column: 'name' } },
        ],
        from: { kind: 'aliased', table: 'users', as: 'u1' },
        joins: [
          {
            source: { kind: 'aliased', table: 'users', as: 'u2' }, // Same table, different alias - OK!
            type: 'inner',
            on: [
              {
                kind: 'comparison',
                left: { source: 'u1', column: 'id' },
                cmp: '=',
                right: { source: 'u2', column: 'id' },
              },
            ],
          },
        ],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Should not have duplicate alias errors
      const duplicateAliasError = payload.result.validationErrors?.find(e =>
        e.message.includes('Duplicate source alias')
      );
      expect(duplicateAliasError).toBeUndefined();
    });

    it('should reject multiple JOINs with duplicate aliases', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'u', column: 'name' } },
        ],
        from: { kind: 'aliased', table: 'users', as: 'u' },
        joins: [
          {
            source: { kind: 'aliased', table: 'departments', as: 'd' },
            type: 'inner',
            on: [
              {
                kind: 'comparison',
                left: '1',
                cmp: '=',
                right: '1',
              },
            ],
          },
          {
            source: { kind: 'aliased', table: 'projects', as: 'd' }, // DUPLICATE alias 'd'!
            type: 'inner',
            on: [
              {
                kind: 'comparison',
                left: '1',
                cmp: '=',
                right: '1',
              },
            ],
          },
        ],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.validationErrors).toBeDefined();
      const duplicateAliasError = payload.result.validationErrors?.find(e =>
        e.message.includes("Duplicate source alias 'd'")
      );
      expect(duplicateAliasError).toBeDefined();
    });
  });

  describe('Duplicate source aliases in DELETE', () => {
    it('should reject DELETE with JOIN using duplicate alias', async () => {
      const query: Query = {
        kind: 'delete',
        table: 'users',
        as: 'u',
        joins: [
          {
            source: { kind: 'aliased', table: 'departments', as: 'u' }, // DUPLICATE alias 'u'!
            type: 'inner',
            on: [
              {
                kind: 'comparison',
                left: '1',
                cmp: '=',
                right: '1',
              },
            ],
          },
        ],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.validationErrors).toBeDefined();
      const duplicateAliasError = payload.result.validationErrors?.find(e =>
        e.message.includes("Duplicate source alias 'u'")
      );
      expect(duplicateAliasError).toBeDefined();
    });

    it('should reject DELETE with implicit table name matching JOIN alias', async () => {
      const query: Query = {
        kind: 'delete',
        table: 'users', // Implicit alias: 'users'
        joins: [
          {
            source: { kind: 'aliased', table: 'departments', as: 'users' }, // DUPLICATE!
            type: 'inner',
            on: [
              {
                kind: 'comparison',
                left: '1',
                cmp: '=',
                right: '1',
              },
            ],
          },
        ],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.validationErrors).toBeDefined();
      const duplicateAliasError = payload.result.validationErrors?.find(e =>
        e.message.includes("Duplicate source alias 'users'")
      );
      expect(duplicateAliasError).toBeDefined();
    });
  });

  describe('Duplicate source aliases in UPDATE', () => {
    it('should reject UPDATE with FROM using duplicate alias', async () => {
      const query: Query = {
        kind: 'update',
        table: 'users',
        as: 'u',
        set: [
          {
            column: 'name',
            value: { source: 'd', column: 'name' },
          },
        ],
        from: { kind: 'aliased', table: 'departments', as: 'u' }, // DUPLICATE alias 'u'!
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.validationErrors).toBeDefined();
      const duplicateAliasError = payload.result.validationErrors?.find(e =>
        e.message.includes("Duplicate source alias 'u'")
      );
      expect(duplicateAliasError).toBeDefined();
    });

    it('should reject UPDATE with JOIN using duplicate alias', async () => {
      const query: Query = {
        kind: 'update',
        table: 'users',
        as: 'u',
        set: [
          {
            column: 'name',
            value: { source: 'd', column: 'name' },
          },
        ],
        joins: [
          {
            source: { kind: 'aliased', table: 'departments', as: 'u' }, // DUPLICATE alias 'u'!
            type: 'inner',
            on: [
              {
                kind: 'comparison',
                left: '1',
                cmp: '=',
                right: '1',
              },
            ],
          },
        ],
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.validationErrors).toBeDefined();
      const duplicateAliasError = payload.result.validationErrors?.find(e =>
        e.message.includes("Duplicate source alias 'u'")
      );
      expect(duplicateAliasError).toBeDefined();
    });
  });

  describe('CTE name conflicts with final statement aliases', () => {
    it('should reject when final statement alias conflicts with CTE name', async () => {
      const query: Query = {
        kind: 'withs',
        withs: [
          {
            kind: 'cte',
            name: 'user_data',
            statement: {
              kind: 'select',
              values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
              from: { kind: 'table', table: 'users' },
            },
          },
        ],
        final: {
          kind: 'select',
          values: [
            { alias: 'user_name', value: { source: 'user_data', column: 'name' } },
            { alias: 'dept_name', value: { source: 'd', column: 'name' } },
          ],
          from: { kind: 'table', table: 'user_data' },
          joins: [
            {
              source: { kind: 'aliased', table: 'departments', as: 'user_data' }, // Conflicts with CTE name!
              type: 'inner',
              on: [
              {
                kind: 'comparison',
                left: '1',
                cmp: '=',
                right: '1',
              },
            ],
            },
          ],
        },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.validationErrors).toBeDefined();
      const conflictError = payload.result.validationErrors?.find(e =>
        e.message.includes("Explicit alias") && e.message.includes("conflicts with a CTE name")
      );
      expect(conflictError).toBeDefined();
    });

    it('should allow CTE name as implicit FROM alias (referencing the CTE)', async () => {
      ctx.addRecord('users', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice' },
      });

      const query: Query = {
        kind: 'withs',
        withs: [
          {
            kind: 'cte',
            name: 'user_data',
            statement: {
              kind: 'select',
              values: [{ alias: 'name', value: { source: 'users', column: 'name' } }],
              from: { kind: 'table', table: 'users' },
            },
          },
        ],
        final: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'user_data', column: 'name' } }],
          from: { kind: 'table', table: 'user_data' }, // Referencing the CTE - OK! (implicit alias)
        },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Should not have conflict errors (referencing a CTE with implicit alias is allowed)
      const conflictError = payload.result.validationErrors?.find(e =>
        e.message.includes('conflicts with a CTE name')
      );
      expect(conflictError).toBeUndefined();
    });
  });

  describe('Set operations (UNION, INTERSECT, EXCEPT)', () => {
    it('should validate aliases in both sides of UNION independently', async () => {
      const query: Query = {
        kind: 'union',
        left: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'u', column: 'name' } }],
          from: { kind: 'aliased', table: 'users', as: 'u' },
          joins: [
            {
              source: { kind: 'aliased', table: 'departments', as: 'u' }, // DUPLICATE in left side!
              type: 'inner',
              on: [
              {
                kind: 'comparison',
                left: '1',
                cmp: '=',
                right: '1',
              },
            ],
            },
          ],
        },
        right: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'u', column: 'name' } }],
          from: { kind: 'aliased', table: 'users', as: 'u' },
        },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(payload.result.validationErrors).toBeDefined();
      const duplicateAliasError = payload.result.validationErrors?.find(e =>
        e.message.includes("Duplicate source alias 'u'") &&
        e.path.includes('.left')
      );
      expect(duplicateAliasError).toBeDefined();
    });

    it('should allow same aliases in left and right sides of UNION (different scopes)', async () => {
      const query: Query = {
        kind: 'union',
        left: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'u', column: 'name' } }],
          from: { kind: 'aliased', table: 'users', as: 'u' },
        },
        right: {
          kind: 'select',
          values: [{ alias: 'name', value: { source: 'u', column: 'name' } }],
          from: { kind: 'aliased', table: 'users', as: 'u' }, // Same alias 'u' but different scope - OK!
        },
      };

      const payload = await executeQueryWithoutCommit(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Should not have duplicate alias errors (different scopes)
      const duplicateAliasError = payload.result.validationErrors?.find(e =>
        e.message.includes('Duplicate source alias')
      );
      expect(duplicateAliasError).toBeUndefined();
    });
  });
});
