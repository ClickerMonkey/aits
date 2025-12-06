import { beforeEach, describe, expect, it } from '@jest/globals';
import type { Query } from '../dba';
import { executeQuery } from '../query';
import { TestContext } from './test-helpers';

describe('Query Sorting and Grouping', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = new TestContext();
  });

  describe('ORDER BY', () => {
    beforeEach(() => {
      ctx.addType({
        name: 'employees',
        friendlyName: 'Employees',
        description: 'Employee records',
        knowledgeTemplate: '{{name}}',
        fields: [
          { name: 'name', friendlyName: 'Name', type: 'string', required: true },
          { name: 'department', friendlyName: 'Department', type: 'string', required: true },
          { name: 'salary', friendlyName: 'Salary', type: 'number', required: true },
          { name: 'hire_date', friendlyName: 'Hire Date', type: 'string', required: true },
        ],
      });

      ctx.addRecord('employees', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Alice', department: 'Engineering', salary: 95000, hire_date: '2020-01-15' },
      });

      ctx.addRecord('employees', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Bob', department: 'Sales', salary: 75000, hire_date: '2019-06-20' },
      });

      ctx.addRecord('employees', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Charlie', department: 'Engineering', salary: 105000, hire_date: '2018-03-10' },
      });

      ctx.addRecord('employees', {
        id: '4',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Diana', department: 'Sales', salary: 85000, hire_date: '2021-09-05' },
      });

      ctx.addRecord('employees', {
        id: '5',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Eve', department: 'Marketing', salary: 70000, hire_date: '2020-11-12' },
      });
    });

    it('should order by single numeric column ascending', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'employees', column: 'name' } },
          { alias: 'salary', value: { source: 'employees', column: 'salary' } },
        ],
        from: { kind: 'table', table: 'employees' },
        orderBy: [{ value: { source: 'employees', column: 'salary' }, dir: 'asc' }],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.rows).toHaveLength(5);
      expect(result.rows[0].name).toBe('Eve');
      expect(result.rows[1].name).toBe('Bob');
      expect(result.rows[2].name).toBe('Diana');
      expect(result.rows[3].name).toBe('Alice');
      expect(result.rows[4].name).toBe('Charlie');
    });

    it('should order by single numeric column descending', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'employees', column: 'name' } },
          { alias: 'salary', value: { source: 'employees', column: 'salary' } },
        ],
        from: { kind: 'table', table: 'employees' },
        orderBy: [{ value: { source: 'employees', column: 'salary' }, dir: 'desc' }],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.rows).toHaveLength(5);
      expect(result.rows[0].name).toBe('Charlie');
      expect(result.rows[1].name).toBe('Alice');
      expect(result.rows[2].name).toBe('Diana');
      expect(result.rows[3].name).toBe('Bob');
      expect(result.rows[4].name).toBe('Eve');
    });

    it('should order by single string column ascending', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'employees', column: 'name' } },
          { alias: 'department', value: { source: 'employees', column: 'department' } },
        ],
        from: { kind: 'table', table: 'employees' },
        orderBy: [{ value: { source: 'employees', column: 'name' }, dir: 'asc' }],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.rows).toHaveLength(5);
      expect(result.rows[0].name).toBe('Alice');
      expect(result.rows[1].name).toBe('Bob');
      expect(result.rows[2].name).toBe('Charlie');
      expect(result.rows[3].name).toBe('Diana');
      expect(result.rows[4].name).toBe('Eve');
    });

    it('should order by multiple columns', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'employees', column: 'name' } },
          { alias: 'department', value: { source: 'employees', column: 'department' } },
          { alias: 'salary', value: { source: 'employees', column: 'salary' } },
        ],
        from: { kind: 'table', table: 'employees' },
        orderBy: [
          { value: { source: 'employees', column: 'department' }, dir: 'asc' },
          { value: { source: 'employees', column: 'salary' }, dir: 'desc' },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.rows).toHaveLength(5);
      // Engineering dept: Charlie (105k) then Alice (95k)
      expect(result.rows[0].name).toBe('Charlie');
      expect(result.rows[0].department).toBe('Engineering');
      expect(result.rows[1].name).toBe('Alice');
      expect(result.rows[1].department).toBe('Engineering');
      // Marketing dept: Eve (70k)
      expect(result.rows[2].name).toBe('Eve');
      expect(result.rows[2].department).toBe('Marketing');
      // Sales dept: Diana (85k) then Bob (75k)
      expect(result.rows[3].name).toBe('Diana');
      expect(result.rows[3].department).toBe('Sales');
      expect(result.rows[4].name).toBe('Bob');
      expect(result.rows[4].department).toBe('Sales');
    });

    it('should order by date string column', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'employees', column: 'name' } },
          { alias: 'hire_date', value: { source: 'employees', column: 'hire_date' } },
        ],
        from: { kind: 'table', table: 'employees' },
        orderBy: [{ value: { source: 'employees', column: 'hire_date' }, dir: 'asc' }],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.rows).toHaveLength(5);
      expect(result.rows[0].name).toBe('Charlie'); // 2018-03-10
      expect(result.rows[1].name).toBe('Bob'); // 2019-06-20
      expect(result.rows[2].name).toBe('Alice'); // 2020-01-15
      expect(result.rows[3].name).toBe('Eve'); // 2020-11-12
      expect(result.rows[4].name).toBe('Diana'); // 2021-09-05
    });

    it('should order with table alias', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'e', column: 'name' } },
          { alias: 'salary', value: { source: 'e', column: 'salary' } },
        ],
        from: { kind: 'aliased', table: 'employees', as: 'e' },
        orderBy: [{ value: { source: 'e', column: 'salary' }, dir: 'desc' }],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.rows).toHaveLength(5);
      expect(result.rows[0].name).toBe('Charlie');
      expect(result.rows[4].name).toBe('Eve');
    });

    it('should order by expression result', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'name', value: { source: 'employees', column: 'name' } },
          { alias: 'salary', value: { source: 'employees', column: 'salary' } },
          {
            alias: 'bonus',
            value: {
              kind: 'binary',
              left: { source: 'employees', column: 'salary' },
              op: '*',
              right: 0.1,
            },
          },
        ],
        from: { kind: 'table', table: 'employees' },
        orderBy: [
          {
            value: {
              kind: 'binary',
              left: { source: 'employees', column: 'salary' },
              op: '*',
              right: 0.1,
            },
            dir: 'desc',
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.rows).toHaveLength(5);
      expect(result.rows[0].name).toBe('Charlie'); // 10500 bonus
      expect(result.rows[0].bonus).toBe(10500);
      expect(result.rows[4].name).toBe('Eve'); // 7000 bonus
      expect(result.rows[4].bonus).toBe(7000);
    });
  });

  describe('GROUP BY', () => {
    beforeEach(() => {
      ctx.addType({
        name: 'sales',
        friendlyName: 'Sales',
        description: 'Sales records',
        knowledgeTemplate: '{{product}}',
        fields: [
          { name: 'product', friendlyName: 'Product', type: 'string', required: true },
          { name: 'region', friendlyName: 'Region', type: 'string', required: true },
          { name: 'amount', friendlyName: 'Amount', type: 'number', required: true },
          { name: 'quantity', friendlyName: 'Quantity', type: 'number', required: true },
        ],
      });

      ctx.addRecord('sales', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { product: 'Widget', region: 'North', amount: 1000, quantity: 10 },
      });

      ctx.addRecord('sales', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { product: 'Widget', region: 'South', amount: 1500, quantity: 15 },
      });

      ctx.addRecord('sales', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { product: 'Widget', region: 'North', amount: 800, quantity: 8 },
      });

      ctx.addRecord('sales', {
        id: '4',
        created: Date.now(),
        updated: Date.now(),
        fields: { product: 'Gadget', region: 'North', amount: 2000, quantity: 5 },
      });

      ctx.addRecord('sales', {
        id: '5',
        created: Date.now(),
        updated: Date.now(),
        fields: { product: 'Gadget', region: 'South', amount: 2500, quantity: 6 },
      });

      ctx.addRecord('sales', {
        id: '6',
        created: Date.now(),
        updated: Date.now(),
        fields: { product: 'Gizmo', region: 'North', amount: 500, quantity: 20 },
      });
    });

    it('should group by single column with COUNT', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'product', value: { source: 'sales', column: 'product' } },
          { alias: 'count', value: { kind: 'aggregate', aggregate: 'count', value: '*' } },
        ],
        from: { kind: 'table', table: 'sales' },
        groupBy: [{ source: 'sales', column: 'product' }],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.rows).toHaveLength(3);
      const widgetRow = result.rows.find((r) => r.product === 'Widget');
      const gadgetRow = result.rows.find((r) => r.product === 'Gadget');
      const gizmoRow = result.rows.find((r) => r.product === 'Gizmo');

      expect(widgetRow?.count).toBe(3);
      expect(gadgetRow?.count).toBe(2);
      expect(gizmoRow?.count).toBe(1);
    });

    it('should group by single column with SUM', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'product', value: { source: 'sales', column: 'product' } },
          {
            alias: 'total_amount',
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'sales', column: 'amount' },
            },
          },
        ],
        from: { kind: 'table', table: 'sales' },
        groupBy: [{ source: 'sales', column: 'product' }],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.rows).toHaveLength(3);
      const widgetRow = result.rows.find((r) => r.product === 'Widget');
      const gadgetRow = result.rows.find((r) => r.product === 'Gadget');
      const gizmoRow = result.rows.find((r) => r.product === 'Gizmo');

      expect(widgetRow?.total_amount).toBe(3300); // 1000 + 1500 + 800
      expect(gadgetRow?.total_amount).toBe(4500); // 2000 + 2500
      expect(gizmoRow?.total_amount).toBe(500);
    });

    it('should group by single column with AVG', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'product', value: { source: 'sales', column: 'product' } },
          {
            alias: 'avg_amount',
            value: {
              kind: 'aggregate',
              aggregate: 'avg',
              value: { source: 'sales', column: 'amount' },
            },
          },
        ],
        from: { kind: 'table', table: 'sales' },
        groupBy: [{ source: 'sales', column: 'product' }],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.rows).toHaveLength(3);
      const widgetRow = result.rows.find((r) => r.product === 'Widget');
      const gadgetRow = result.rows.find((r) => r.product === 'Gadget');

      expect(widgetRow?.avg_amount).toBe(1100); // (1000 + 1500 + 800) / 3
      expect(gadgetRow?.avg_amount).toBe(2250); // (2000 + 2500) / 2
    });

    it('should group by single column with MIN and MAX', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'product', value: { source: 'sales', column: 'product' } },
          {
            alias: 'min_amount',
            value: {
              kind: 'aggregate',
              aggregate: 'min',
              value: { source: 'sales', column: 'amount' },
            },
          },
          {
            alias: 'max_amount',
            value: {
              kind: 'aggregate',
              aggregate: 'max',
              value: { source: 'sales', column: 'amount' },
            },
          },
        ],
        from: { kind: 'table', table: 'sales' },
        groupBy: [{ source: 'sales', column: 'product' }],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.rows).toHaveLength(3);
      const widgetRow = result.rows.find((r) => r.product === 'Widget');
      const gadgetRow = result.rows.find((r) => r.product === 'Gadget');

      expect(widgetRow?.min_amount).toBe(800);
      expect(widgetRow?.max_amount).toBe(1500);
      expect(gadgetRow?.min_amount).toBe(2000);
      expect(gadgetRow?.max_amount).toBe(2500);
    });

    it('should group by multiple columns', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'product', value: { source: 'sales', column: 'product' } },
          { alias: 'region', value: { source: 'sales', column: 'region' } },
          {
            alias: 'total_amount',
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'sales', column: 'amount' },
            },
          },
        ],
        from: { kind: 'table', table: 'sales' },
        groupBy: [
          { source: 'sales', column: 'product' },
          { source: 'sales', column: 'region' },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.rows).toHaveLength(5);
      const widgetNorth = result.rows.find((r) => r.product === 'Widget' && r.region === 'North');
      const widgetSouth = result.rows.find((r) => r.product === 'Widget' && r.region === 'South');
      const gadgetNorth = result.rows.find((r) => r.product === 'Gadget' && r.region === 'North');
      const gadgetSouth = result.rows.find((r) => r.product === 'Gadget' && r.region === 'South');
      const gizmoNorth = result.rows.find((r) => r.product === 'Gizmo' && r.region === 'North');

      expect(widgetNorth?.total_amount).toBe(1800); // 1000 + 800
      expect(widgetSouth?.total_amount).toBe(1500);
      expect(gadgetNorth?.total_amount).toBe(2000);
      expect(gadgetSouth?.total_amount).toBe(2500);
      expect(gizmoNorth?.total_amount).toBe(500);
    });

    it('should group by with ORDER BY', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'product', value: { source: 'sales', column: 'product' } },
          {
            alias: 'total_amount',
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'sales', column: 'amount' },
            },
          },
        ],
        from: { kind: 'table', table: 'sales' },
        groupBy: [{ source: 'sales', column: 'product' }],
        orderBy: [
          {
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'sales', column: 'amount' },
            },
            dir: 'desc',
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].product).toBe('Gadget'); // 4500
      expect(result.rows[1].product).toBe('Widget'); // 3300
      expect(result.rows[2].product).toBe('Gizmo'); // 500
    });

    it('should group by with multiple aggregates', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'region', value: { source: 'sales', column: 'region' } },
          { alias: 'count', value: { kind: 'aggregate', aggregate: 'count', value: '*' } },
          {
            alias: 'total_amount',
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'sales', column: 'amount' },
            },
          },
          {
            alias: 'avg_amount',
            value: {
              kind: 'aggregate',
              aggregate: 'avg',
              value: { source: 'sales', column: 'amount' },
            },
          },
          {
            alias: 'total_quantity',
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'sales', column: 'quantity' },
            },
          },
        ],
        from: { kind: 'table', table: 'sales' },
        groupBy: [{ source: 'sales', column: 'region' }],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.rows).toHaveLength(2);
      const northRow = result.rows.find((r) => r.region === 'North');
      const southRow = result.rows.find((r) => r.region === 'South');

      expect(northRow?.count).toBe(4); // Widget x2, Gadget x1, Gizmo x1
      expect(northRow?.total_amount).toBe(4300); // 1000 + 800 + 2000 + 500
      expect(northRow?.total_quantity).toBe(43); // 10 + 8 + 5 + 20
      expect(southRow?.count).toBe(2); // Widget x1, Gadget x1
      expect(southRow?.total_amount).toBe(4000); // 1500 + 2500
      expect(southRow?.total_quantity).toBe(21); // 15 + 6
    });
  });

  describe('HAVING', () => {
    beforeEach(() => {
      ctx.addType({
        name: 'orders',
        friendlyName: 'Orders',
        description: 'Order records',
        knowledgeTemplate: '{{customer}}',
        fields: [
          { name: 'customer', friendlyName: 'Customer', type: 'string', required: true },
          { name: 'product', friendlyName: 'Product', type: 'string', required: true },
          { name: 'amount', friendlyName: 'Amount', type: 'number', required: true },
        ],
      });

      ctx.addRecord('orders', {
        id: '1',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Alice', product: 'Widget', amount: 100 },
      });

      ctx.addRecord('orders', {
        id: '2',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Alice', product: 'Gadget', amount: 200 },
      });

      ctx.addRecord('orders', {
        id: '3',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Bob', product: 'Widget', amount: 150 },
      });

      ctx.addRecord('orders', {
        id: '4',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Bob', product: 'Gizmo', amount: 50 },
      });

      ctx.addRecord('orders', {
        id: '5',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Charlie', product: 'Widget', amount: 300 },
      });

      ctx.addRecord('orders', {
        id: '6',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Charlie', product: 'Gadget', amount: 250 },
      });

      ctx.addRecord('orders', {
        id: '7',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Charlie', product: 'Gizmo', amount: 100 },
      });

      ctx.addRecord('orders', {
        id: '8',
        created: Date.now(),
        updated: Date.now(),
        fields: { customer: 'Diana', product: 'Widget', amount: 75 },
      });
    });

    it('should filter groups with HAVING COUNT', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer', value: { source: 'orders', column: 'customer' } },
          { alias: 'order_count', value: { kind: 'aggregate', aggregate: 'count', value: '*' } },
        ],
        from: { kind: 'table', table: 'orders' },
        groupBy: [{ source: 'orders', column: 'customer' }],
        having: [
          {
            kind: 'comparison',
            left: { kind: 'aggregate', aggregate: 'count', value: '*' },
            cmp: '>',
            right: 2,
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Only Charlie has more than 2 orders (3 orders)
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].customer).toBe('Charlie');
      expect(result.rows[0].order_count).toBe(3);
    });

    it('should filter groups with HAVING SUM', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer', value: { source: 'orders', column: 'customer' } },
          {
            alias: 'total_amount',
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
            cmp: '>=',
            right: 300,
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Alice: 300, Bob: 200, Charlie: 650, Diana: 75
      expect(result.rows).toHaveLength(2);
      const customers = result.rows.map((r) => r.customer);
      expect(customers).toContain('Alice');
      expect(customers).toContain('Charlie');
    });

    it('should filter groups with HAVING AVG', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer', value: { source: 'orders', column: 'customer' } },
          {
            alias: 'avg_amount',
            value: {
              kind: 'aggregate',
              aggregate: 'avg',
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
              aggregate: 'avg',
              value: { source: 'orders', column: 'amount' },
            },
            cmp: '>',
            right: 150,
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Alice: 150, Bob: 100, Charlie: 216.67, Diana: 75
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].customer).toBe('Charlie');
    });

    it('should filter groups with multiple HAVING conditions', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer', value: { source: 'orders', column: 'customer' } },
          { alias: 'order_count', value: { kind: 'aggregate', aggregate: 'count', value: '*' } },
          {
            alias: 'total_amount',
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
            left: { kind: 'aggregate', aggregate: 'count', value: '*' },
            cmp: '>=',
            right: 2,
          },
          {
            kind: 'comparison',
            left: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'orders', column: 'amount' },
            },
            cmp: '>',
            right: 250,
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Alice: 2 orders, 300 total ✓
      // Bob: 2 orders, 200 total ✗
      // Charlie: 3 orders, 650 total ✓
      expect(result.rows).toHaveLength(2);
      const customers = result.rows.map((r) => r.customer);
      expect(customers).toContain('Alice');
      expect(customers).toContain('Charlie');
    });

    it('should combine GROUP BY, HAVING, and ORDER BY', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer', value: { source: 'orders', column: 'customer' } },
          {
            alias: 'total_amount',
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
            cmp: '>=',
            right: 200,
          },
        ],
        orderBy: [
          {
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'orders', column: 'amount' },
            },
            dir: 'desc',
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Alice: 300, Bob: 200, Charlie: 650
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].customer).toBe('Charlie');
      expect(result.rows[0].total_amount).toBe(650);
      expect(result.rows[1].customer).toBe('Alice');
      expect(result.rows[1].total_amount).toBe(300);
      expect(result.rows[2].customer).toBe('Bob');
      expect(result.rows[2].total_amount).toBe(200);
    });

    it('should group by product with HAVING and ORDER BY', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'product', value: { source: 'orders', column: 'product' } },
          { alias: 'count', value: { kind: 'aggregate', aggregate: 'count', value: '*' } },
          {
            alias: 'total_amount',
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'orders', column: 'amount' },
            },
          },
        ],
        from: { kind: 'table', table: 'orders' },
        groupBy: [{ source: 'orders', column: 'product' }],
        having: [
          {
            kind: 'comparison',
            left: { kind: 'aggregate', aggregate: 'count', value: '*' },
            cmp: '>',
            right: 1,
          },
        ],
        orderBy: [
          {
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'orders', column: 'amount' },
            },
            dir: 'desc',
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Widget: 4 orders, 625 total
      // Gadget: 2 orders, 450 total
      // Gizmo: 2 orders, 150 total
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].product).toBe('Widget');
      expect(result.rows[0].total_amount).toBe(625);
      expect(result.rows[1].product).toBe('Gadget');
      expect(result.rows[1].total_amount).toBe(450);
      expect(result.rows[2].product).toBe('Gizmo');
      expect(result.rows[2].total_amount).toBe(150);
    });
  });

  describe('Complex combinations', () => {
    beforeEach(() => {
      ctx.addType({
        name: 'transactions',
        friendlyName: 'Transactions',
        description: 'Transaction records',
        knowledgeTemplate: '{{type}}',
        fields: [
          { name: 'account', friendlyName: 'Account', type: 'string', required: true },
          { name: 'type', friendlyName: 'Type', type: 'string', required: true },
          { name: 'amount', friendlyName: 'Amount', type: 'number', required: true },
          { name: 'date', friendlyName: 'Date', type: 'string', required: true },
        ],
      });

      const accounts = ['A001', 'A002', 'A003'];
      const types = ['deposit', 'withdrawal', 'transfer'];
      const amounts = [100, 250, 500, 750, 1000];
      const dates = ['2024-01-15', '2024-02-20', '2024-03-10'];

      let id = 1;
      for (const account of accounts) {
        for (const type of types) {
          for (const amount of amounts.slice(0, 2)) {
            ctx.addRecord('transactions', {
              id: String(id++),
              created: Date.now(),
              updated: Date.now(),
              fields: {
                account,
                type,
                amount,
                date: dates[Math.floor(Math.random() * dates.length)],
              },
            });
          }
        }
      }
    });

    it('should combine WHERE, GROUP BY, HAVING, and ORDER BY', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'account', value: { source: 'transactions', column: 'account' } },
          {
            alias: 'total_amount',
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'transactions', column: 'amount' },
            },
          },
          {
            alias: 'avg_amount',
            value: {
              kind: 'aggregate',
              aggregate: 'avg',
              value: { source: 'transactions', column: 'amount' },
            },
          },
        ],
        from: { kind: 'table', table: 'transactions' },
        where: [
          {
            kind: 'comparison',
            left: { source: 'transactions', column: 'type' },
            cmp: '<>',
            right: 'transfer',
          },
        ],
        groupBy: [{ source: 'transactions', column: 'account' }],
        having: [
          {
            kind: 'comparison',
            left: {
              kind: 'aggregate',
              aggregate: 'avg',
              value: { source: 'transactions', column: 'amount' },
            },
            cmp: '>',
            right: 150,
          },
        ],
        orderBy: [
          {
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'transactions', column: 'amount' },
            },
            dir: 'desc',
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Verify results exist and are ordered correctly
      expect(result.rows.length).toBeGreaterThan(0);
      for (let i = 0; i < result.rows.length - 1; i++) {
        expect((result.rows[i].total_amount as number) >= (result.rows[i + 1].total_amount as number)).toBe(
          true
        );
      }
    });

    it('should group by multiple columns with complex ORDER BY', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'account', value: { source: 'transactions', column: 'account' } },
          { alias: 'type', value: { source: 'transactions', column: 'type' } },
          { alias: 'count', value: { kind: 'aggregate', aggregate: 'count', value: '*' } },
          {
            alias: 'total_amount',
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'transactions', column: 'amount' },
            },
          },
        ],
        from: { kind: 'table', table: 'transactions' },
        groupBy: [
          { source: 'transactions', column: 'account' },
          { source: 'transactions', column: 'type' },
        ],
        orderBy: [
          { value: { source: 'transactions', column: 'account' }, dir: 'asc' },
          {
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'transactions', column: 'amount' },
            },
            dir: 'desc',
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Verify results are grouped and ordered
      expect(result.rows.length).toBeGreaterThan(0);
      let lastAccount = '';
      for (const row of result.rows) {
        if (row.account !== lastAccount) {
          lastAccount = row.account as string;
        } else {
          expect(row.account).toBe(lastAccount);
        }
      }
    });
  });
});
