import { z } from 'zod';
import { globalToolProperties, type CletusAI } from '../ai';
import { getOperationInput } from '../operations/types';
import { createDBASchemas } from '../helpers/dba';

/**
 * Create architect tools for type definition management
 */
export function createArchitectTools(ai: CletusAI) {
  const configData = ai.config.defaultContext!.config!.getData();
  const types = configData.types.map((t) => t.name);

  const fieldType = z.enum(['string', 'number', 'boolean', 'date', 'enum', ...types]).describe('Field type - can be a primitive type (string, number, boolean, date, enum) or the name of another type to create a relationship');

  const typeInfo = ai.tool({
    name: 'type_info',
    description: 'Get all information about a type definition',
    instructions: `Use this to see the full schema of a custom data type including all fields and their properties.

Example: Get information about a type:
{ "name": "task" }
 
{{modeInstructions}}`,
    schema: z.object({
      name: z.string().describe('Type name'),
      ...globalToolProperties,
    }),
    input: getOperationInput('type_info'),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'type_info', input }, ctx),
  });

  const typeList = ai.tool({
    name: 'type_list',
    description: 'List all existing type definitions (names & descriptions',
    instructions: `Use this to get a list of all custom data types defined in the system, including their names and friendly names.
Example: List all types:
{ }
 
{{modeInstructions}}`,
    schema: z.object({
      ...globalToolProperties,
    }),
    input: getOperationInput('type_list'),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'type_list', input }, ctx),
  });

  const typeUpdate = ai.tool({
    name: 'type_update',
    description: 'Update a type definition in a backwards compatible way',
    instructions: `Use this to modify an existing type definition. You MUST ensure backwards compatibility:
- Never change field types (breaking change)
- Never remove required fields (breaking change)
- Never make optional fields required without a default value (breaking change)
- You CAN add new fields (if required, must have default), update descriptions, update knowledgeTemplate, or delete optional fields
Provide an update object with the changes to make.
- Field names must be lowercase with no spaces.
- Knowledge templates are Handlebars templates used to generate knowledge base entries for records of this type. They should include all fields and use #if statements for optional fields. Use field name and not friendly name.

IMPORTANT:
- All types automatically have an 'id' primary key field - DO NOT add an 'id' field unless explicitly requested by the user
- Field types can be the name of another type to create relationships (e.g., "userId" field with type "user")
- RESERVED NAMES: The following field names are reserved and cannot be used: id, created, updated

Example 1: Add a new optional field:
{ "name": "task", "update": { "fields": { "priority": { "friendlyName": "Priority", "type": "number", "required": false } } } }

Example 2: Add a relationship field to another type:
{ "name": "task", "update": { "fields": { "assigneeid": { "friendlyName": "Assignee", "type": "user", "required": false } } } }

Example 3: Update description:
{ "name": "task", "update": { "description": "A task tracking item with assignee and deadline" } }

Example 4: Make a field optional:
{ "name": "task", "update": { "fields": { "deadline": { "required": false } } } }

If fields are being changed knowledgeTemplate MUST be updated to reflect those changes.
If the knowledgeTemplate is updated and there are records for this type the data_index tool should be called to reindex the knowledge base.

{{modeInstructions}}`,
    schema: ({ config }) => z.object({
      name: z.enum(config.getData().types.map(t => t.name)).describe('Type name to update'),
      update: z.object({
        friendlyName: z.string().optional().describe('New friendly name'),
        description: z.string().optional().describe('New description'),
        knowledgeTemplate: z.string().optional().describe('New Handlebars template for knowledge generation, ie: {{name}} and {{#if field}}...{{/if}}. It should include all fields and if the fields are optional #if statements should be used. Newlines & markdown can be used for formatting.'),
        fields: z.array(z.object({
          field: z.string().describe('Field name to update (lowercase, no spaces)'),
          change: z.union([
            z.null(),
            z.object({
              friendlyName: z.string().optional().describe('Field display name, only specify if changing'),
              type: fieldType.optional().describe('Field type, only specify if changing'),
              required: z.boolean().optional().describe('Is field required? Only specify if changing'),
              default: z.union([z.string(), z.number(), z.boolean()]).optional().describe('Default value, only specify if changing'),
              enumOptions: z.array(z.string()).optional().describe('Valid enum values (required for enum type), only specify if changing or adding enum field'),
              onDelete: z.enum(['restrict', 'cascade', 'setNull']).optional().describe('Cascade delete behavior for reference fields, only specify if changing: restrict (default, prevent deletion), cascade (delete referencing records), setNull (set field to null)'),
            })
          ]).describe('Field updates: set to null to delete')
        }))
      }).describe('Updates to apply'),
      ...globalToolProperties,
    }),
    input: getOperationInput('type_update'),
    applicable: ({ config }) => config.getData().types.length > 0,
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'type_update', input }, ctx),
  });

  const typeCreate = ai.tool({
    name: 'type_create',
    description: 'Create a new type definition',
    instructions: `Use this to define a new custom data type with fields. Each field should have a name, friendlyName, and type. Required fields must have a default value. Field names must be all lowercase with no spaces.

IMPORTANT:
- All types automatically have an 'id' primary key field - DO NOT add an 'id' field to the fields array unless explicitly requested by the user
- Field types can be the name of another type to create relationships (e.g., "userId" field with type "user")
- When creating multiple related types, create them one at a time in dependency order (create referenced types before types that reference them)
- RESERVED NAMES: The following field names are reserved and cannot be used: id, created, updated
- RESERVED TYPE NAMES: The following type names are reserved and cannot be used: string, number, boolean, date, enum

Example 1: Create a project tracking type:
{ "name": "project", "friendlyName": "Project", "description": "Software project tracking", "knowledgeTemplate": "Project: {{name}}\\nStatus: {{status}}\\n{{#if description}}Description: {{description}}{{/if}}", "fields": [{ "name": "name", "friendlyName": "Name", "type": "string", "required": true }, { "name": "status", "friendlyName": "Status", "type": "enum", "enumOptions": ["planning", "active", "completed"], "required": true, "default": "planning" }, { "name": "description", "friendlyName": "Description", "type": "string", "required": false }] }

Example 2: Create a task type with a relationship to project (create project type first, then task):
{ "name": "task", "friendlyName": "Task", "description": "Task assigned to a project", "knowledgeTemplate": "Task: {{name}}\\nProject: {{projectid}}\\nStatus: {{status}}", "fields": [{ "name": "name", "friendlyName": "Name", "type": "string", "required": true }, { "name": "projectid", "friendlyName": "Project", "type": "project", "required": true }, { "name": "status", "friendlyName": "Status", "type": "string", "required": true, "default": "todo" }] }

{{modeInstructions}}`,
    schema: z.object({
      name: z.string().describe('Type name (lowercase, no spaces)'),
      friendlyName: z.string().describe('Display name'),
      description: z.string().optional().describe('Type description'),
      knowledgeTemplate: z.string().describe('Handlebars template for knowledge generation, ie: {{name}} and {{#if field}}...{{/if}}. It should include all fields and if the fields are optional #if statements should be used. Newlines & markdown can be used for formatting.'),
      fields: z.array(
        z.object({
          name: z.string().describe('Field name (lowecase, no spaces)'),
          friendlyName: z.string().describe('Field display name'),
          type: fieldType,
          default: z.union([z.string(), z.number(), z.boolean()]).optional().describe('Default value'),
          required: z.boolean().optional().describe('Is field required?'),
          enumOptions: z.array(z.string()).optional().describe('Valid enum values (required for enum type)'),
          onDelete: z.enum(['restrict', 'cascade', 'setNull']).optional().describe('Cascade delete behavior for reference fields: restrict (default, prevent deletion), cascade (delete referencing records), setNull (set field to null)'),
        })
      ).describe('Field definitions'),
      ...globalToolProperties,
    }),
    input: getOperationInput('type_create'),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'type_create', input }, ctx),
  });

  const typeDelete = ai.tool({
    name: 'type_delete',
    description: 'Delete a type definition',
    instructions: `Use this to remove a type definition. This will fail if:
- The type is referenced by other types (to prevent breaking references)
- There are existing data records of this type (data must be deleted first)

Example: Delete a type:
{ "name": "task" }
 
{{modeInstructions}}`,
    schema: z.object({
      name: z.string().describe('Type name to delete'),
      ...globalToolProperties,
    }),
    input: getOperationInput('type_delete'),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'type_delete', input }, ctx),
  });

  const typeImport = ai.tool({
    name: 'type_import',
    description: 'Import and discover type definitions from files',
    instructions: `Use this to extract type definitions from unstructured files. The tool will:
1. Find files matching the glob pattern
2. Process readable files (text, PDF, Excel, Word documents)
3. Use AI to discover structured type definitions with fields
4. Present discovered types for review without automatically adding them

This is useful when the user wants to:
- "extract all transaction data from all my files"
- "can you convert this document to structured data"
- "discover data types in my CSV files"
- "analyze my JSON files and create type definitions"

The discovered types are presented with field definitions and instance counts. The user can then review and selectively add types using type_create.

IMPORTANT:
- RESERVED FIELD NAMES: The following field names are reserved and cannot be used: id, created, updated
- RESERVED TYPE NAMES: The following type names are reserved and cannot be used: string, number, boolean, date, enum

Example 1: Discover all types from data files:
{ "glob": "data/**/*.csv" }

Example 2: Focus on specific types:
{ "glob": "documents/**/*.txt", "hints": ["user", "transaction", "product"] }

Example 3: Limit discovery to top types:
{ "glob": "**/*.json", "max": 5 }
 
{{modeInstructions}}`,
    schema: z.object({
      glob: z.string().describe('Glob pattern for files to analyze (e.g., "data/*.csv", "**/*.txt")'),
      hints: z.array(z.string()).optional().describe('Optional type name hints to focus discovery (e.g., ["user", "order", "product"])'),
      max: z.number().optional().describe('Maximum number of types to discover (default: unlimited)'),
      ...globalToolProperties,
    }),
    input: getOperationInput('type_import'),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'type_import', input }, ctx),
  });

  const dbaQuery = ai.tool({
    name: 'query',
    description: 'Execute complex SQL-like queries across data types',
    instructions: `Use this to execute complex queries that span multiple data types, including:
- SELECT with joins, subqueries, aggregations, window functions
- INSERT with conflict handling and returning
- UPDATE with joins and complex conditions
- DELETE with joins and complex conditions
- UNION, INTERSECT, EXCEPT set operations
- WITH (CTE) statements including recursive CTEs

Available tables: ${types.length > 0 ? types.join(', ') : 'none defined yet'}

The query is a structured JSON object representing SQL operations.

Example 1: Simple SELECT with filter:
{
  "kind": "select",
  "values": [{ "alias": "name", "value": { "source": "users", "column": "name" } }],
  "from": { "kind": "table", "table": "users" },
  "where": [{ "kind": "comparison", "left": { "source": "users", "column": "active" }, "cmp": "=", "right": true }],
  "limit": 10
}

Example 2: JOIN query:
{
  "kind": "select",
  "values": [
    { "alias": "userName", "value": { "source": "u", "column": "name" } },
    { "alias": "orderTotal", "value": { "source": "o", "column": "total" } }
  ],
  "from": { "kind": "table", "table": "users", "as": "u" },
  "joins": [{
    "source": { "kind": "table", "table": "orders", "as": "o" },
    "type": "inner",
    "on": [{ "kind": "comparison", "left": { "source": "u", "column": "id" }, "cmp": "=", "right": { "source": "o", "column": "userId" } }]
  }]
}

Example 3: Aggregation with GROUP BY:
{
  "kind": "select",
  "values": [
    { "alias": "category", "value": { "source": "products", "column": "category" } },
    { "alias": "avgPrice", "value": { "kind": "aggregate", "aggregate": "avg", "value": { "source": "products", "column": "price" } } }
  ],
  "from": { "kind": "table", "table": "products" },
  "groupBy": [{ "source": "products", "column": "category" }]
}

{{modeInstructions}}`,
    schema: ({ config }) => {
      // Build schema dynamically from current config types
      const currentTypes = config.getData().types;
      const dbaSchemas = createDBASchemas(currentTypes);
      return z.object({
        query: dbaSchemas.QuerySchema.describe('The query to execute'),
        ...globalToolProperties,
      });
    },
    input: getOperationInput('query'),
    applicable: ({ config }) => config.getData().types.length > 0,
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'query', input }, ctx),
  });

  return [
    typeInfo,
    typeUpdate,
    typeCreate,
    typeDelete,
    typeImport,
    typeList,
    dbaQuery,
  ] as [
    typeof typeInfo,
    typeof typeUpdate,
    typeof typeCreate,
    typeof typeDelete,
    typeof typeImport,
    typeof typeList,
    typeof dbaQuery,
  ];
}
