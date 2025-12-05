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
      from: { kind: 'table', table: 'employees', as: 'e' },
      joins: [
        {
          type: 'inner',
          source: { kind: 'table', table: 'departments', as: 'd' },
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
      from: { kind: 'table', table: 'projects', as: 'p' },
      joins: [
        {
          type: 'inner',
          source: { kind: 'table', table: 'tasks', as: 't' },
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
      from: { kind: 'table', table: 'books', as: 'b' },
      joins: [
        {
          type: 'inner',
          source: { kind: 'table', table: 'authors', as: 'a' },
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
          source: { kind: 'table', table: 'publishers', as: 'p' },
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
