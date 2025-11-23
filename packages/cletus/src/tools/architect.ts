import { z } from 'zod';
import type { CletusAI } from '../ai';

/**
 * Create architect tools for type definition management
 */
export function createArchitectTools(ai: CletusAI) {
  const configData = ai.config.defaultContext!.config!.getData();
  const types = configData.types.map((t) => t.name);

  const fieldType = z.enum(['string', 'number', 'boolean', 'date', 'enum', ...types]).describe('Field type (custom types are allowed)');

  const typeInfo = ai.tool({
    name: 'type_info',
    description: 'Get all information about a type definition',
    instructions: `Use this to see the full schema of a custom data type including all fields and their properties.

Example: Get information about a type:
{ "name": "task" }`,
    schema: z.object({
      name: z.string().describe('Type name'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'type_info', input }, ctx),
  });

  const typeList = ai.tool({
    name: 'type_list',
    description: 'List all existing type definitions (names & descriptions',
    instructions: `Use this to get a list of all custom data types defined in the system, including their names and friendly names.
Example: List all types:
{ }`,
    schema: z.object({}),
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

Example 1: Add a new optional field:
{ "name": "task", "update": { "fields": { "priority": { "friendlyName": "Priority", "type": "number", "required": false } } } }

Example 2: Update description:
{ "name": "task", "update": { "description": "A task tracking item with assignee and deadline" } }
 
If fields are being changed knowledgeTemplate MUST be updated to reflect those changes.
If the knowledgeTemplate is updated and there are records for this type the data_index tool should be called to reindex the knowledge base.`,
    schema: z.object({
      name: z.string().describe('Type name'),
      update: z.object({
        friendlyName: z.string().optional().describe('New friendly name'),
        description: z.string().optional().describe('New description'),
        knowledgeTemplate: z.string().optional().describe('New Handlebars template for knowledge generation, ie: {{name}} and {{#if field}}...{{/if}}. It should include all fields and if the fields are optional #if statements should be used. Newlines & markdown can be used for formatting.'),
        fields: z.record(
          z.string(),
          z.union([
            z.null(),
            z.object({
              friendlyName: z.string().optional(),
              type: fieldType.optional(),
              required: z.boolean().optional(),
              default: z.union([z.string(), z.number(), z.boolean()]).optional(),
              enumOptions: z.array(z.string()).optional(),
              onDelete: z.enum(['restrict', 'cascade', 'setNull']).optional().describe('Cascade delete behavior for reference fields'),
            })
          ])
        ).optional().describe('Field updates: set to null to delete, object to add/update'),
      }).describe('Updates to apply'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'type_update', input }, ctx),
  });

  const typeCreate = ai.tool({
    name: 'type_create',
    description: 'Create a new type definition',
    instructions: `Use this to define a new custom data type with fields. Each field should have a name, friendlyName, and type. Required fields must have a default value. Field names must be all lowercase with no spaces.

Example: Create a project tracking type:
{ "name": "project", "friendlyName": "Project", "description": "Software project tracking", "knowledgeTemplate": "Project: {{name}}\\nStatus: {{status}}\\n{{#if description}}Description: {{description}}{{/if}}", "fields": [{ "name": "name", "friendlyName": "Name", "type": "string", "required": true }, { "name": "status", "friendlyName": "Status", "type": "enum", "enumOptions": ["planning", "active", "completed"], "required": true, "default": "planning" }, { "name": "description", "friendlyName": "Description", "type": "string", "required": false }] }`,
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
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'type_create', input }, ctx),
  });

  const typeDelete = ai.tool({
    name: 'type_delete',
    description: 'Delete a type definition',
    instructions: `Use this to remove a type definition. This will fail if:
- The type is referenced by other types (to prevent breaking references)
- There are existing data records of this type (data must be deleted first)

Example: Delete a type:
{ "name": "task" }`,
    schema: z.object({
      name: z.string().describe('Type name to delete'),
    }),
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

Example 1: Discover all types from data files:
{ "glob": "data/**/*.csv" }

Example 2: Focus on specific types:
{ "glob": "documents/**/*.txt", "hints": ["user", "transaction", "product"] }

Example 3: Limit discovery to top types:
{ "glob": "**/*.json", "max": 5 }`,
    schema: z.object({
      glob: z.string().describe('Glob pattern for files to analyze (e.g., "data/*.csv", "**/*.txt")'),
      hints: z.array(z.string()).optional().describe('Optional type name hints to focus discovery (e.g., ["user", "order", "product"])'),
      max: z.number().optional().describe('Maximum number of types to discover (default: unlimited)'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'type_import', input }, ctx),
  });

  return [
    typeInfo,
    typeUpdate,
    typeCreate,
    typeDelete,
    typeImport,
    typeList,
  ] as [
    typeof typeInfo,
    typeof typeUpdate,
    typeof typeCreate,
    typeof typeDelete,
    typeof typeImport,
    typeof typeList,
  ];
}
