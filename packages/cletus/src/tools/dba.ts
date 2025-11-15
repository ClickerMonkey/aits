import { z } from 'zod';
import type { CletusAI, CletusAIContext } from '../ai';
import type { TypeDefinition, TypeField } from '../schemas';
import { generateExampleFields, generateExampleWhere, getSchemas } from '../helpers/type';

/**
 * Create the DBA agent that identifies the type first, then creates specific tools.
 */
export function createDBAAgent(ai: CletusAI) {
  const aiTyped = ai.extend<{ type: TypeDefinition }>();

  const dataCreate = aiTyped.tool({
    name: 'data_create',
    description: `Create a new record`,
    descriptionFn: ({ type }) => `Create a new ${type.friendlyName} record`,
    instructionsFn: ({ type }) => `Use this to create a new ${type.friendlyName}. ${type.description || ''}\n\nFields:\n${type.fields.map(f => `- ${f.friendlyName} (${f.name}): ${f.type}${f.required ? ' [required]' : ''}${f.default !== undefined ? ` [default: ${f.default}]` : ''}`).join('\n')}\n\nExample: Create a new record with field values:\n{ "fields": ${generateExampleFields(type.fields, true)} }`,
    schema: ({ type, cache }) => z.object({
      fields: getSchemas(type, cache).fields.describe('Field values for the new record'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_create', input: { name: ctx.type.name, fields: input.fields } }, ctx as unknown as CletusAIContext),
  });

  const dataUpdate = aiTyped.tool({
    name: 'data_update',
    description: `Update a record by ID`,
    descriptionFn: ({ type }) => `Update a ${type.friendlyName} record by ID`,
    instructionsFn: ({ type }) => `Use this to update specific fields in an existing ${type.friendlyName}. Only provide fields you want to change.\n\nExample: Update a record:\n{ "id": "abc-123", "fields": ${generateExampleFields(type.fields.slice(0, 2))} }`,
    schema: ({ type, cache }) => z.object({
      id: z.string().describe('Record ID'),
      fields: getSchemas(type, cache).fields.partial().describe('Fields to update'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_update', input: { name: ctx.type.name, id: input.id, fields: input.fields } }, ctx as unknown as CletusAIContext),
  });

  const dataDelete = aiTyped.tool({
    name: 'data_delete',
    description: `Delete a record by ID`,
    descriptionFn: ({ type }) => `Delete a ${type.friendlyName} record by ID`,
    instructionsFn: ({ type }) => `Use this to permanently delete a ${type.friendlyName}.\n\nExample: Delete a record by ID:\n{ "id": "abc-123" }`,
    schema: z.object({
      id: z.string().describe('Record ID'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_delete', input: { name: ctx.type.name, id: input.id } }, ctx as unknown as CletusAIContext),
  });

  const dataSelect = aiTyped.tool({
    name: 'data_select',
    description: `Query records`,
    descriptionFn: ({ type }) => `Query ${type.friendlyName} records`,
    instructionsFn: ({ type }) => {
      const firstField = type.fields[0];
      const sortField = type.fields.find(f => f.type === 'number' || f.type === 'date') || firstField;

      return `Use this to search and retrieve ${type.friendlyName} records. Supports:
- where: Filter by field values with and/or logic
- offset/limit: Pagination
- orderBy: Sort by field(s)

Available fields: ${type.fields.map(f => `${f.name} (${f.type})`).join(', ')}

Example 1: Find records with filter:
{ "where": ${generateExampleWhere(firstField)}, "limit": 10 }

Example 2: Query with sorting:
{ "where": ${generateExampleWhere(firstField)}, "orderBy": [{ "field": "${sortField.name}", "direction": "desc" }] }`;
    },
    schema: ({ type, cache }) => z.object({
      where: getSchemas(type, cache).where.optional().describe('Filter conditions with and/or logic'),
      offset: z.number().optional().default(0).describe('Starting position'),
      limit: z.number().optional().default(10).describe('Maximum results'),
      orderBy: z.array(
        z.object({
          field: z.enum(type.fields.map(f => f.name) as [string, ...string[]]),
          direction: z.enum(['asc', 'desc']).default('asc'),
        })
      ).optional().describe('Sort order'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_select', input: { name: ctx.type.name, ...input } }, ctx as unknown as CletusAIContext),
  });

  const dataUpdateMany = aiTyped.tool({
    name: 'data_update_many',
    description: `Update multiple records`,
    descriptionFn: ({ type }) => `Update multiple ${type.friendlyName} records`,
    instructionsFn: ({ type }) => {
      const firstField = type.fields[0];
      const updateField = type.fields[1] || firstField;
      return `Use this to bulk update ${type.friendlyName} records that match a where clause.\n\nExample: Bulk update records:\n{ "set": ${generateExampleFields([updateField])}, "where": ${generateExampleWhere(firstField)} }`;
    },
    schema: ({ type, cache }) => z.object({
      set: getSchemas(type, cache).fields.partial().describe('Fields to set on matching records'),
      where: getSchemas(type, cache).where.optional().describe('Filter conditions'),
      limit: z.number().optional().describe('Maximum records to update'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_update_many', input: { name: ctx.type.name, ...input } }, ctx as unknown as CletusAIContext),
  });

  const dataDeleteMany = aiTyped.tool({
    name: 'data_delete_many',
    description: `Delete multiple records`,
    descriptionFn: ({ type }) => `Delete multiple ${type.friendlyName} records`,
    instructionsFn: ({ type }) => `Use this to bulk delete ${type.friendlyName} records that match a where clause.\n\nExample: Delete matching records:\n{ "where": ${generateExampleWhere(type.fields[0])} }`,
    schema: ({ type, cache }) => z.object({
      where: getSchemas(type, cache).where.describe('Filter conditions'),
      limit: z.number().optional().describe('Maximum records to delete'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_delete_many', input: { name: ctx.type.name, ...input } }, ctx as unknown as CletusAIContext),
  });

  const dataAggregate = aiTyped.tool({
    name: 'data_aggregate',
    description: `Perform aggregation queries`,
    descriptionFn: ({ type }) => `Perform aggregation queries on ${type.friendlyName}`,
    instructionsFn: ({ type }) => {
      const groupField = type.fields.find(f => f.type === 'string' || f.type === 'enum') || type.fields[0];
      const aggField = type.fields.find(f => f.type === 'number') || type.fields[0];
      const aggFunc = aggField.type === 'number' ? 'avg' : 'count';

      return `Use this for analytics and reporting on ${type.friendlyName} data:
- groupBy: Group by field(s)
- where: Filter before aggregation
- having: Filter after aggregation
- select: Aggregation functions (count, sum, avg, min, max)
- orderBy: Sort results

Available fields: ${type.fields.map(f => `${f.name} (${f.type})`).join(', ')}

Example 1: Count records by field:
{ "groupBy": ["${groupField.name}"], "select": [{ "function": "count", "alias": "total" }] }

Example 2: Aggregate with filter:
{ "where": ${generateExampleWhere(groupField)}, "select": [{ "function": "${aggFunc}", ${aggFunc !== 'count' ? `"field": "${aggField.name}", ` : ''}"alias": "result" }] }`;
    },
    schema: ({ type, cache }) => z.object({
      where: getSchemas(type, cache).where.optional().describe('Pre-aggregation filter'),
      having: getSchemas(type, cache).where.optional().describe('Post-aggregation filter'),
      groupBy: z.array(getSchemas(type, cache).fieldNames).optional().describe('Fields to group by'),
      orderBy: z.array(
        z.object({
          field: getSchemas(type, cache).fieldNames,
          direction: z.enum(['asc', 'desc']).default('asc'),
        })
      ).optional().describe('Sort order'),
      select: z.array(
        z.object({
          function: z.enum(['count', 'sum', 'avg', 'min', 'max']),
          field: getSchemas(type, cache).fieldNames.optional(),
          alias: z.string().optional(),
        })
      ).describe('Aggregation functions'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_aggregate', input: { name: ctx.type.name, ...input } }, ctx as unknown as CletusAIContext),
  });

  const dataIndex = aiTyped.tool({
    name: 'data_index',
    description: `Index data records for knowledge base. `,
    descriptionFn: ({ type }) => `Index ${type.friendlyName} records for knowledge base`,
    instructionsFn: ({ type }) => `Use this to (re)index ${type.friendlyName} records into the knowledge base for improved search and retrieval. 
This should be done if an embedding model has changed or a knowledge template has changed.`,
    schema: z.object({}),
    call: async (_, __, ctx) => ctx.ops.handle({ type: 'data_index', input: { name: ctx.type.name } }, ctx as unknown as CletusAIContext),
  });

  const dataImport = aiTyped.tool({
    name: 'data_import',
    description: `Import data from files using AI extraction`,
    descriptionFn: ({ type }) => `Import ${type.friendlyName} records from files`,
    instructionsFn: ({ type }) => `Use this to import ${type.friendlyName} records from files. The tool will:
1. Find files matching the glob pattern
2. Process readable files (text, PDF, Excel, Word documents)
3. Extract structured data using AI with schema validation
4. Determine unique fields automatically to avoid duplicates
5. Merge data, updating existing records or creating new ones

Example: Import from CSV or text files:
{ "glob": "data/*.csv" }

Example: Import with image text extraction:
{ "glob": "documents/**/*.pdf", "transcribeImages": true }`,
    schema: z.object({
      glob: z.string().describe('Glob pattern for files to import (e.g., "data/*.csv", "**/*.txt")'),
      transcribeImages: z.boolean().optional().describe('Extract text from images in documents (default: false)'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_import', input: { name: ctx.type.name, ...input } }, ctx as unknown as CletusAIContext),
  });
    
  const dataSearch = aiTyped.tool({
    name: 'data_search',
    description: `Search data records by semantic similarity`,
    descriptionFn: ({ type }) => `Search ${type.friendlyName} records by semantic similarity`,
    instructionsFn: ({ type }) => `Use this to find relevant ${type.friendlyName} records from the knowledge base using semantic search. Provide a query and optionally specify the number of results.

Example: Search for relevant records:
{ "query": "user preferences for notifications", "n": 5 }`,
    schema: z.object({
      query: z.string().describe('Search query text'),
      n: z.number().optional().describe('Maximum results (default: 10)'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_search', input: { name: ctx.type.name, query: input.query, n: input.n } }, ctx as unknown as CletusAIContext),
  });

  const dba = aiTyped.prompt({
    name: 'dba',
    description: 'Database administrator agent for data operations',
    content: `You are the DBA agent for Cletus, responsible for managing data operations.

<userInformation>
{{userPrompt}}
</userInformation>

<typeInformation>
You are working with {{type.friendlyName}} data. {{type.description}}
Fields:
{{#each type.fields}}- {{this.friendlyName}} ({{this.name}}): {{this.type}}{{#if this.required}} [required]{{/if}}{{#if this.default}} [default: {{this.default}}]{{/if}}
{{/each}}
</typeInformation>

Use the available tools to complete the data operation requested in the conversation.

You have been given the following request to perform by the chat agent, the conversation follows.
<userRequest>
{{request}}
</userRequest>
`,
    tools: [
      dataCreate,
      dataUpdate,
      dataDelete,
      dataSelect,
      dataUpdateMany,
      dataDeleteMany,
      dataAggregate,
      dataIndex,
      dataImport,
      dataSearch,
    ],
    metadataFn: (_, { config, chat }) => ({
      model: chat?.model || config.getData().user.models?.chat,
    }),
    input: ({ request }: { request: string }, { userPrompt, type }) => ({ userPrompt, request, type }),
  });

  return dba;
}