import { executeQuery, IDataManager } from '../query';
import type { Query } from '../dba';
import { DataRecord, DataFile, TypeDefinition, KnowledgeEntry } from '../../schemas';
import { TestContext } from './test-helpers';


describe('executeQuery - JOIN column collision handling', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = new TestContext();
  });

  it('should handle JOINs with overlapping system columns (id, created, updated)', async () => {
    // Setup - Create two tables with overlapping system columns
    ctx.addType({
      name: 'employees',
      friendlyName: 'Employees',
      description: 'Employee records',
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
        { name: 'budget', friendlyName: 'Budget', type: 'number', required: true },
      ],
    });

    const empId = 'emp1';
    const deptId = 'dept1';
    const empCreated = Date.now() - 1000;
    const deptCreated = Date.now() - 2000;
    const empUpdated = Date.now() - 500;
    const deptUpdated = Date.now() - 250;

    ctx.addRecord('employees', {
      id: empId,
      created: empCreated,
      updated: empUpdated,
      fields: { name: 'Alice', department_id: deptId },
    });

    ctx.addRecord('departments', {
      id: deptId,
      created: deptCreated,
      updated: deptUpdated,
      fields: { name: 'Engineering', budget: 100000 },
    });

    // Query: SELECT e.id, e.name, e.created, d.id, d.name, d.created
    // FROM employees e JOIN departments d ON e.department_id = d.id
    const query: Query = {
      kind: 'select',
      values: [
        { alias: 'employee_id', value: { source: 'e', column: 'id' } },
        { alias: 'employee_name', value: { source: 'e', column: 'name' } },
        { alias: 'employee_created', value: { source: 'e', column: 'created' } },
        { alias: 'employee_updated', value: { source: 'e', column: 'updated' } },
        { alias: 'department_id', value: { source: 'd', column: 'id' } },
        { alias: 'department_name', value: { source: 'd', column: 'name' } },
        { alias: 'department_created', value: { source: 'd', column: 'created' } },
        { alias: 'department_updated', value: { source: 'd', column: 'updated' } },
      ],
      from: { kind: 'aliased', table: 'employees', as: 'e' },
      joins: [
        {
          type: 'inner',
          source: { kind: 'aliased', table: 'departments', as: 'd' },
          on: [
            {
              kind: 'comparison',
              left: { source: 'e', column: 'department_id' },
              cmp: '=',
              right: { source: 'd', column: 'id' },
            },
          ],
        },
      ],
    };

    // Execute
    const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

    // Assert - Both tables' id, created, updated should be preserved
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];

    // Employee fields should not be overwritten
    expect(row.employee_id).toBe(empId);
    expect(row.employee_name).toBe('Alice');
    expect(row.employee_created).toBe(empCreated);
    expect(row.employee_updated).toBe(empUpdated);

    // Department fields should not be overwritten
    expect(row.department_id).toBe(deptId);
    expect(row.department_name).toBe('Engineering');
    expect(row.department_created).toBe(deptCreated);
    expect(row.department_updated).toBe(deptUpdated);

    // All values should be distinct (no overwrites)
    expect(row.employee_id).not.toBe(row.department_id);
    expect(row.employee_name).not.toBe(row.department_name);
    expect(row.employee_created).not.toBe(row.department_created);
    expect(row.employee_updated).not.toBe(row.department_updated);
  });

  it('should handle JOINs with overlapping custom field names', async () => {
    // Setup - Two tables both with 'name' and 'status' fields
    ctx.addType({
      name: 'projects',
      friendlyName: 'Projects',
      description: 'Project records',
      knowledgeTemplate: '{{name}}',
      fields: [
        { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        { name: 'status', friendlyName: 'Status', type: 'string', required: true },
        { name: 'owner_id', friendlyName: 'Owner ID', type: 'string', required: true },
      ],
    });

    ctx.addType({
      name: 'tasks',
      friendlyName: 'Tasks',
      description: 'Task records',
      knowledgeTemplate: '{{name}}',
      fields: [
        { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        { name: 'status', friendlyName: 'Status', type: 'string', required: true },
        { name: 'project_id', friendlyName: 'Project ID', type: 'string', required: true },
      ],
    });

    const projectId = 'proj1';
    ctx.addRecord('projects', {
      id: projectId,
      created: Date.now(),
      updated: Date.now(),
      fields: { name: 'Website Redesign', status: 'active', owner_id: 'user1' },
    });

    ctx.addRecord('tasks', {
      id: 'task1',
      created: Date.now(),
      updated: Date.now(),
      fields: { name: 'Design Homepage', status: 'completed', project_id: projectId },
    });

    ctx.addRecord('tasks', {
      id: 'task2',
      created: Date.now(),
      updated: Date.now(),
      fields: { name: 'Implement Backend', status: 'in-progress', project_id: projectId },
    });

    // Query: SELECT p.name, p.status, t.name, t.status
    // FROM projects p JOIN tasks t ON p.id = t.project_id
    const query: Query = {
      kind: 'select',
      values: [
        { alias: 'project_name', value: { source: 'p', column: 'name' } },
        { alias: 'project_status', value: { source: 'p', column: 'status' } },
        { alias: 'task_name', value: { source: 't', column: 'name' } },
        { alias: 'task_status', value: { source: 't', column: 'status' } },
      ],
      from: { kind: 'aliased', table: 'projects', as: 'p' },
      joins: [
        {
          type: 'inner',
          source: { kind: 'aliased', table: 'tasks', as: 't' },
          on: [
            {
              kind: 'comparison',
              left: { source: 'p', column: 'id' },
              cmp: '=',
              right: { source: 't', column: 'project_id' },
            },
          ],
        },
      ],
    };

    // Execute
    const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

    // Assert - Should have 2 rows (one project joined with 2 tasks)
    expect(result.rows).toHaveLength(2);

    // All rows should have the same project data
    for (const row of result.rows) {
      expect(row.project_name).toBe('Website Redesign');
      expect(row.project_status).toBe('active');
    }

    // But different task data
    const task1Row = result.rows.find(r => r.task_name === 'Design Homepage');
    const task2Row = result.rows.find(r => r.task_name === 'Implement Backend');

    expect(task1Row).toBeDefined();
    expect(task1Row?.task_status).toBe('completed');

    expect(task2Row).toBeDefined();
    expect(task2Row?.task_status).toBe('in-progress');

    // Verify no overwrites - project and task data should be distinct
    expect(task1Row?.project_name).not.toBe(task1Row?.task_name);
    expect(task1Row?.project_status).not.toBe(task1Row?.task_status);
  });

  it('should handle three-way JOINs with overlapping column names', async () => {
    // Setup - Three tables all with 'name' field
    ctx.addType({
      name: 'authors',
      friendlyName: 'Authors',
      description: 'Author records',
      knowledgeTemplate: '{{name}}',
      fields: [
        { name: 'name', friendlyName: 'Name', type: 'string', required: true },
      ],
    });

    ctx.addType({
      name: 'books',
      friendlyName: 'Books',
      description: 'Book records',
      knowledgeTemplate: '{{name}}',
      fields: [
        { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        { name: 'author_id', friendlyName: 'Author ID', type: 'string', required: true },
        { name: 'publisher_id', friendlyName: 'Publisher ID', type: 'string', required: true },
      ],
    });

    ctx.addType({
      name: 'publishers',
      friendlyName: 'Publishers',
      description: 'Publisher records',
      knowledgeTemplate: '{{name}}',
      fields: [
        { name: 'name', friendlyName: 'Name', type: 'string', required: true },
      ],
    });

    const authorId = 'auth1';
    const publisherId = 'pub1';

    ctx.addRecord('authors', {
      id: authorId,
      created: Date.now(),
      updated: Date.now(),
      fields: { name: 'J.K. Rowling' },
    });

    ctx.addRecord('publishers', {
      id: publisherId,
      created: Date.now(),
      updated: Date.now(),
      fields: { name: 'Bloomsbury' },
    });

    ctx.addRecord('books', {
      id: 'book1',
      created: Date.now(),
      updated: Date.now(),
      fields: { name: 'Harry Potter', author_id: authorId, publisher_id: publisherId },
    });

    // Query: SELECT a.name, b.name, p.name
    // FROM books b
    // JOIN authors a ON b.author_id = a.id
    // JOIN publishers p ON b.publisher_id = p.id
    const query: Query = {
      kind: 'select',
      values: [
        { alias: 'author_name', value: { source: 'a', column: 'name' } },
        { alias: 'book_name', value: { source: 'b', column: 'name' } },
        { alias: 'publisher_name', value: { source: 'p', column: 'name' } },
      ],
      from: { kind: 'aliased', table: 'books', as: 'b' },
      joins: [
        {
          type: 'inner',
          source: { kind: 'aliased', table: 'authors', as: 'a' },
          on: [
            {
              kind: 'comparison',
              left: { source: 'b', column: 'author_id' },
              cmp: '=',
              right: { source: 'a', column: 'id' },
            },
          ],
        },
        {
          type: 'inner',
          source: { kind: 'aliased', table: 'publishers', as: 'p' },
          on: [
            {
              kind: 'comparison',
              left: { source: 'b', column: 'publisher_id' },
              cmp: '=',
              right: { source: 'p', column: 'id' },
            },
          ],
        },
      ],
    };

    // Execute
    const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

    // Assert - All three 'name' fields should be distinct
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];

    expect(row.author_name).toBe('J.K. Rowling');
    expect(row.book_name).toBe('Harry Potter');
    expect(row.publisher_name).toBe('Bloomsbury');

    // All three should be different (no overwrites)
    expect(row.author_name).not.toBe(row.book_name);
    expect(row.book_name).not.toBe(row.publisher_name);
    expect(row.author_name).not.toBe(row.publisher_name);
  });
});

describe('executeQuery - Comprehensive JOIN tests', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = new TestContext();

    // Setup common test data
    ctx.addType({
      name: 'customers',
      friendlyName: 'Customers',
      description: 'Customer records',
      knowledgeTemplate: '{{name}}',
      fields: [
        { name: 'name', friendlyName: 'Name', type: 'string', required: true },
        { name: 'email', friendlyName: 'Email', type: 'string', required: true },
      ],
    });

    ctx.addType({
      name: 'orders',
      friendlyName: 'Orders',
      description: 'Order records',
      knowledgeTemplate: '{{order_number}}',
      fields: [
        { name: 'order_number', friendlyName: 'Order Number', type: 'string', required: true },
        { name: 'customer_id', friendlyName: 'Customer ID', type: 'string', required: false },
        { name: 'amount', friendlyName: 'Amount', type: 'number', required: true },
      ],
    });

    // Customer with orders
    ctx.addRecord('customers', {
      id: 'c1',
      created: Date.now(),
      updated: Date.now(),
      fields: { name: 'Alice', email: 'alice@example.com' },
    });

    // Customer with no orders
    ctx.addRecord('customers', {
      id: 'c2',
      created: Date.now(),
      updated: Date.now(),
      fields: { name: 'Bob', email: 'bob@example.com' },
    });

    // Orders for Alice
    ctx.addRecord('orders', {
      id: 'o1',
      created: Date.now(),
      updated: Date.now(),
      fields: { order_number: 'ORD-001', customer_id: 'c1', amount: 100 },
    });

    ctx.addRecord('orders', {
      id: 'o2',
      created: Date.now(),
      updated: Date.now(),
      fields: { order_number: 'ORD-002', customer_id: 'c1', amount: 200 },
    });

    // Order with no customer (null customer_id)
    ctx.addRecord('orders', {
      id: 'o3',
      created: Date.now(),
      updated: Date.now(),
      fields: { order_number: 'ORD-003', customer_id: null, amount: 50 },
    });
  });

  describe('INNER JOIN', () => {
    it('should return only matching rows from both tables', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer_name', value: { source: 'c', column: 'name' } },
          { alias: 'order_number', value: { source: 'o', column: 'order_number' } },
          { alias: 'amount', value: { source: 'o', column: 'amount' } },
        ],
        from: { kind: 'aliased', table: 'customers', as: 'c' },
        joins: [
          {
            type: 'inner',
            source: { kind: 'aliased', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'c', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'customer_id' },
              },
            ],
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Should only have Alice's 2 orders (Bob has no orders, ORD-003 has no customer)
      expect(result.rows).toHaveLength(2);
      expect(result.rows.every((r) => r.customer_name === 'Alice')).toBe(true);

      const orderNumbers = result.rows.map((r) => r.order_number).sort();
      expect(orderNumbers).toEqual(['ORD-001', 'ORD-002']);
    });

    it('should handle multiple join conditions', async () => {
      ctx.addType({
        name: 'inventory',
        friendlyName: 'Inventory',
        description: 'Inventory records',
        knowledgeTemplate: '{{product_code}}',
        fields: [
          { name: 'product_code', friendlyName: 'Product Code', type: 'string', required: true },
          { name: 'warehouse', friendlyName: 'Warehouse', type: 'string', required: true },
          { name: 'quantity', friendlyName: 'Quantity', type: 'number', required: true },
        ],
      });

      ctx.addType({
        name: 'shipments',
        friendlyName: 'Shipments',
        description: 'Shipment records',
        knowledgeTemplate: '{{tracking}}',
        fields: [
          { name: 'tracking', friendlyName: 'Tracking', type: 'string', required: true },
          { name: 'product_code', friendlyName: 'Product Code', type: 'string', required: true },
          { name: 'warehouse', friendlyName: 'Warehouse', type: 'string', required: true },
        ],
      });

      ctx.addRecord('inventory', {
        id: 'i1',
        created: Date.now(),
        updated: Date.now(),
        fields: { product_code: 'WIDGET-A', warehouse: 'NYC', quantity: 100 },
      });

      ctx.addRecord('inventory', {
        id: 'i2',
        created: Date.now(),
        updated: Date.now(),
        fields: { product_code: 'WIDGET-A', warehouse: 'LA', quantity: 50 },
      });

      ctx.addRecord('shipments', {
        id: 's1',
        created: Date.now(),
        updated: Date.now(),
        fields: { tracking: 'TRACK-001', product_code: 'WIDGET-A', warehouse: 'NYC' },
      });

      ctx.addRecord('shipments', {
        id: 's2',
        created: Date.now(),
        updated: Date.now(),
        fields: { tracking: 'TRACK-002', product_code: 'WIDGET-A', warehouse: 'LA' },
      });

      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'tracking', value: { source: 's', column: 'tracking' } },
          { alias: 'product_code', value: { source: 'i', column: 'product_code' } },
          { alias: 'warehouse', value: { source: 'i', column: 'warehouse' } },
          { alias: 'quantity', value: { source: 'i', column: 'quantity' } },
        ],
        from: { kind: 'aliased', table: 'inventory', as: 'i' },
        joins: [
          {
            type: 'inner',
            source: { kind: 'aliased', table: 'shipments', as: 's' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'i', column: 'product_code' },
                cmp: '=',
                right: { source: 's', column: 'product_code' },
              },
              {
                kind: 'comparison',
                left: { source: 'i', column: 'warehouse' },
                cmp: '=',
                right: { source: 's', column: 'warehouse' },
              },
            ],
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Should match on both product_code AND warehouse
      expect(result.rows).toHaveLength(2);

      const nycRow = result.rows.find((r) => r.warehouse === 'NYC');
      const laRow = result.rows.find((r) => r.warehouse === 'LA');

      expect(nycRow?.tracking).toBe('TRACK-001');
      expect(nycRow?.quantity).toBe(100);

      expect(laRow?.tracking).toBe('TRACK-002');
      expect(laRow?.quantity).toBe(50);
    });

    it('should handle INNER JOIN with WHERE clause', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer_name', value: { source: 'c', column: 'name' } },
          { alias: 'order_number', value: { source: 'o', column: 'order_number' } },
          { alias: 'amount', value: { source: 'o', column: 'amount' } },
        ],
        from: { kind: 'aliased', table: 'customers', as: 'c' },
        joins: [
          {
            type: 'inner',
            source: { kind: 'aliased', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'c', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'customer_id' },
              },
            ],
          },
        ],
        where: [
          {
            kind: 'comparison',
            left: { source: 'o', column: 'amount' },
            cmp: '>',
            right: 100,
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Only ORD-002 with amount 200 should match
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].order_number).toBe('ORD-002');
      expect(result.rows[0].amount).toBe(200);
    });
  });

  describe('LEFT JOIN', () => {
    it('should return all left rows with matched right rows', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer_name', value: { source: 'c', column: 'name' } },
          { alias: 'order_number', value: { source: 'o', column: 'order_number' } },
          { alias: 'amount', value: { source: 'o', column: 'amount' } },
        ],
        from: { kind: 'aliased', table: 'customers', as: 'c' },
        joins: [
          {
            type: 'left',
            source: { kind: 'aliased', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'c', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'customer_id' },
              },
            ],
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Alice with 2 orders + Bob with no orders = 3 rows
      expect(result.rows).toHaveLength(3);

      const aliceRows = result.rows.filter((r) => r.customer_name === 'Alice');
      const bobRows = result.rows.filter((r) => r.customer_name === 'Bob');

      expect(aliceRows).toHaveLength(2);
      expect(aliceRows.every((r) => r.order_number !== null)).toBe(true);

      expect(bobRows).toHaveLength(1);
      expect(bobRows[0].order_number).toBeUndefined(); // No order matched
      expect(bobRows[0].amount).toBeUndefined();
    });

    it('should handle LEFT JOIN with WHERE on left table', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer_name', value: { source: 'c', column: 'name' } },
          { alias: 'order_number', value: { source: 'o', column: 'order_number' } },
        ],
        from: { kind: 'aliased', table: 'customers', as: 'c' },
        joins: [
          {
            type: 'left',
            source: { kind: 'aliased', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'c', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'customer_id' },
              },
            ],
          },
        ],
        where: [
          {
            kind: 'comparison',
            left: { source: 'c', column: 'name' },
            cmp: '=',
            right: 'Alice',
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Only Alice's rows
      expect(result.rows).toHaveLength(2);
      expect(result.rows.every((r) => r.customer_name === 'Alice')).toBe(true);
    });

    it('should handle LEFT JOIN with IS NULL check for unmatched rows', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer_name', value: { source: 'c', column: 'name' } },
          { alias: 'order_number', value: { source: 'o', column: 'order_number' } },
        ],
        from: { kind: 'aliased', table: 'customers', as: 'c' },
        joins: [
          {
            type: 'left',
            source: { kind: 'aliased', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'c', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'customer_id' },
              },
            ],
          },
        ],
        where: [
          {
            kind: 'isNull',
            isNull: { source: 'o', column: 'order_number' },
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Only Bob (customer with no orders)
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].customer_name).toBe('Bob');
      expect(result.rows[0].order_number).toBeUndefined();
    });
  });

  describe('RIGHT JOIN', () => {
    it('should return all right rows with matched left rows', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer_name', value: { source: 'c', column: 'name' } },
          { alias: 'order_number', value: { source: 'o', column: 'order_number' } },
          { alias: 'amount', value: { source: 'o', column: 'amount' } },
        ],
        from: { kind: 'aliased', table: 'customers', as: 'c' },
        joins: [
          {
            type: 'right',
            source: { kind: 'aliased', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'c', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'customer_id' },
              },
            ],
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // All 3 orders (ORD-001, ORD-002 with Alice, ORD-003 with no customer)
      expect(result.rows).toHaveLength(3);

      const aliceOrders = result.rows.filter((r) => r.customer_name === 'Alice');
      const orphanOrders = result.rows.filter((r) => r.customer_name === undefined);

      expect(aliceOrders).toHaveLength(2);
      expect(orphanOrders).toHaveLength(1);
      expect(orphanOrders[0].order_number).toBe('ORD-003');
    });

    it('should handle RIGHT JOIN with WHERE on right table', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer_name', value: { source: 'c', column: 'name' } },
          { alias: 'order_number', value: { source: 'o', column: 'order_number' } },
          { alias: 'amount', value: { source: 'o', column: 'amount' } },
        ],
        from: { kind: 'aliased', table: 'customers', as: 'c' },
        joins: [
          {
            type: 'right',
            source: { kind: 'aliased', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'c', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'customer_id' },
              },
            ],
          },
        ],
        where: [
          {
            kind: 'comparison',
            left: { source: 'o', column: 'amount' },
            cmp: '>=',
            right: 100,
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // ORD-001 (100) and ORD-002 (200), but not ORD-003 (50)
      expect(result.rows).toHaveLength(2);

      const orderNumbers = result.rows.map((r) => r.order_number).sort();
      expect(orderNumbers).toEqual(['ORD-001', 'ORD-002']);
    });
  });

  describe('FULL JOIN', () => {
    it('should return all rows from both tables', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer_name', value: { source: 'c', column: 'name' } },
          { alias: 'order_number', value: { source: 'o', column: 'order_number' } },
          { alias: 'amount', value: { source: 'o', column: 'amount' } },
        ],
        from: { kind: 'aliased', table: 'customers', as: 'c' },
        joins: [
          {
            type: 'full',
            source: { kind: 'aliased', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'c', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'customer_id' },
              },
            ],
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Alice with 2 orders + Bob with no orders + ORD-003 with no customer = 4 rows
      expect(result.rows).toHaveLength(4);

      const aliceRows = result.rows.filter((r) => r.customer_name === 'Alice');
      const bobRows = result.rows.filter((r) => r.customer_name === 'Bob');
      const orphanOrders = result.rows.filter(
        (r) => r.customer_name === undefined && r.order_number !== undefined
      );

      expect(aliceRows).toHaveLength(2);
      expect(bobRows).toHaveLength(1);
      expect(bobRows[0].order_number).toBeUndefined();
      expect(orphanOrders).toHaveLength(1);
      expect(orphanOrders[0].order_number).toBe('ORD-003');
    });

    it('should handle FULL JOIN with complex WHERE clause', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer_name', value: { source: 'c', column: 'name' } },
          { alias: 'order_number', value: { source: 'o', column: 'order_number' } },
        ],
        from: { kind: 'aliased', table: 'customers', as: 'c' },
        joins: [
          {
            type: 'full',
            source: { kind: 'aliased', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'c', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'customer_id' },
              },
            ],
          },
        ],
        where: [
          {
            kind: 'or',
            or: [
              {
                kind: 'isNull',
                isNull: { source: 'c', column: 'name' },
              },
              {
                kind: 'isNull',
                isNull: { source: 'o', column: 'order_number' },
              },
            ],
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Bob (no orders) + ORD-003 (no customer)
      expect(result.rows).toHaveLength(2);

      const bobRow = result.rows.find((r) => r.customer_name === 'Bob');
      const orphanRow = result.rows.find((r) => r.order_number === 'ORD-003');

      expect(bobRow).toBeDefined();
      expect(orphanRow).toBeDefined();
    });
  });

  describe('JOIN with aggregations', () => {
    it('should handle JOIN with GROUP BY and aggregation', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer_name', value: { source: 'c', column: 'name' } },
          {
            alias: 'total_orders',
            value: { kind: 'aggregate', aggregate: 'count', value: '*' },
          },
          {
            alias: 'total_amount',
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'o', column: 'amount' },
            },
          },
        ],
        from: { kind: 'aliased', table: 'customers', as: 'c' },
        joins: [
          {
            type: 'left',
            source: { kind: 'aliased', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'c', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'customer_id' },
              },
            ],
          },
        ],
        groupBy: [{ source: 'c', column: 'name' }],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.rows).toHaveLength(2);

      const aliceRow = result.rows.find((r) => r.customer_name === 'Alice');
      const bobRow = result.rows.find((r) => r.customer_name === 'Bob');

      expect(aliceRow?.total_orders).toBe(2);
      expect(aliceRow?.total_amount).toBe(300); // 100 + 200

      expect(bobRow?.total_orders).toBe(1); // One row for Bob even with no orders
      expect(bobRow?.total_amount).toBe(0); // SUM of no values = 0
    });

    it('should handle JOIN with ORDER BY on aggregated column', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer_name', value: { source: 'c', column: 'name' } },
          {
            alias: 'total_amount',
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'o', column: 'amount' },
            },
          },
        ],
        from: { kind: 'aliased', table: 'customers', as: 'c' },
        joins: [
          {
            type: 'inner',
            source: { kind: 'aliased', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'c', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'customer_id' },
              },
            ],
          },
        ],
        groupBy: [{ source: 'c', column: 'name' }],
        orderBy: [
          {
            value: {
              kind: 'aggregate',
              aggregate: 'sum',
              value: { source: 'o', column: 'amount' },
            },
            dir: 'desc',
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.rows).toHaveLength(1); // Only Alice has orders
      expect(result.rows[0].customer_name).toBe('Alice');
      expect(result.rows[0].total_amount).toBe(300);
    });
  });

  describe('Multiple JOINs', () => {
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

      ctx.addType({
        name: 'order_items',
        friendlyName: 'Order Items',
        description: 'Order item records',
        knowledgeTemplate: '{{id}}',
        fields: [
          { name: 'order_id', friendlyName: 'Order ID', type: 'string', required: true },
          { name: 'product_id', friendlyName: 'Product ID', type: 'string', required: true },
          { name: 'quantity', friendlyName: 'Quantity', type: 'number', required: true },
        ],
      });

      ctx.addRecord('products', {
        id: 'p1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Widget', price: 10 },
      });

      ctx.addRecord('products', {
        id: 'p2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Gadget', price: 20 },
      });

      ctx.addRecord('order_items', {
        id: 'oi1',
        created: Date.now(),
        updated: Date.now(),
        fields: { order_id: 'o1', product_id: 'p1', quantity: 2 },
      });

      ctx.addRecord('order_items', {
        id: 'oi2',
        created: Date.now(),
        updated: Date.now(),
        fields: { order_id: 'o1', product_id: 'p2', quantity: 1 },
      });
    });

    it('should handle three-table INNER JOIN', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer_name', value: { source: 'c', column: 'name' } },
          { alias: 'order_number', value: { source: 'o', column: 'order_number' } },
          { alias: 'product_name', value: { source: 'p', column: 'name' } },
          { alias: 'quantity', value: { source: 'oi', column: 'quantity' } },
          { alias: 'price', value: { source: 'p', column: 'price' } },
        ],
        from: { kind: 'aliased', table: 'customers', as: 'c' },
        joins: [
          {
            type: 'inner',
            source: { kind: 'aliased', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'c', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'customer_id' },
              },
            ],
          },
          {
            type: 'inner',
            source: { kind: 'aliased', table: 'order_items', as: 'oi' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'o', column: 'id' },
                cmp: '=',
                right: { source: 'oi', column: 'order_id' },
              },
            ],
          },
          {
            type: 'inner',
            source: { kind: 'aliased', table: 'products', as: 'p' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'oi', column: 'product_id' },
                cmp: '=',
                right: { source: 'p', column: 'id' },
              },
            ],
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Alice's order (o1) with 2 items
      expect(result.rows).toHaveLength(2);

      const widgetRow = result.rows.find((r) => r.product_name === 'Widget');
      const gadgetRow = result.rows.find((r) => r.product_name === 'Gadget');

      expect(widgetRow).toBeDefined();
      expect(widgetRow?.customer_name).toBe('Alice');
      expect(widgetRow?.order_number).toBe('ORD-001');
      expect(widgetRow?.quantity).toBe(2);
      expect(widgetRow?.price).toBe(10);

      expect(gadgetRow).toBeDefined();
      expect(gadgetRow?.customer_name).toBe('Alice');
      expect(gadgetRow?.order_number).toBe('ORD-001');
      expect(gadgetRow?.quantity).toBe(1);
      expect(gadgetRow?.price).toBe(20);
    });

    it('should handle mixed join types (LEFT and INNER)', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'customer_name', value: { source: 'c', column: 'name' } },
          { alias: 'order_number', value: { source: 'o', column: 'order_number' } },
          { alias: 'product_name', value: { source: 'p', column: 'name' } },
        ],
        from: { kind: 'aliased', table: 'customers', as: 'c' },
        joins: [
          {
            type: 'left',
            source: { kind: 'aliased', table: 'orders', as: 'o' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'c', column: 'id' },
                cmp: '=',
                right: { source: 'o', column: 'customer_id' },
              },
            ],
          },
          {
            type: 'left',
            source: { kind: 'aliased', table: 'order_items', as: 'oi' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'o', column: 'id' },
                cmp: '=',
                right: { source: 'oi', column: 'order_id' },
              },
            ],
          },
          {
            type: 'inner',
            source: { kind: 'aliased', table: 'products', as: 'p' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'oi', column: 'product_id' },
                cmp: '=',
                right: { source: 'p', column: 'id' },
              },
            ],
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      // Alice with order items (2 rows)
      // Bob would be included by LEFT JOIN but filtered by INNER JOIN to products
      expect(result.rows).toHaveLength(2);
      expect(result.rows.every((r) => r.customer_name === 'Alice')).toBe(true);
      expect(result.rows.every((r) => r.product_name !== undefined)).toBe(true);
    });
  });

  describe('Self JOIN', () => {
    beforeEach(() => {
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

      ctx.addRecord('employees', {
        id: 'e1',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'CEO', manager_id: null },
      });

      ctx.addRecord('employees', {
        id: 'e2',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Manager', manager_id: 'e1' },
      });

      ctx.addRecord('employees', {
        id: 'e3',
        created: Date.now(),
        updated: Date.now(),
        fields: { name: 'Employee', manager_id: 'e2' },
      });
    });

    it('should handle self-join to get employee-manager pairs', async () => {
      const query: Query = {
        kind: 'select',
        values: [
          { alias: 'employee_name', value: { source: 'e', column: 'name' } },
          { alias: 'manager_name', value: { source: 'm', column: 'name' } },
        ],
        from: { kind: 'aliased', table: 'employees', as: 'e' },
        joins: [
          {
            type: 'left',
            source: { kind: 'aliased', table: 'employees', as: 'm' },
            on: [
              {
                kind: 'comparison',
                left: { source: 'e', column: 'manager_id' },
                cmp: '=',
                right: { source: 'm', column: 'id' },
              },
            ],
          },
        ],
      };

      const { result } = await executeQuery(query, ctx.getTypes, ctx.getManager, ctx.getKnowledge, ctx.embed);

      expect(result.rows).toHaveLength(3);

      const ceoRow = result.rows.find((r) => r.employee_name === 'CEO');
      const managerRow = result.rows.find((r) => r.employee_name === 'Manager');
      const employeeRow = result.rows.find((r) => r.employee_name === 'Employee');

      expect(ceoRow?.manager_name).toBeUndefined(); // CEO has no manager
      expect(managerRow?.manager_name).toBe('CEO');
      expect(employeeRow?.manager_name).toBe('Manager');
    });
  });
});
