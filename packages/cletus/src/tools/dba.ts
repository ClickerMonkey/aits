import { z } from 'zod';
import { globalToolProperties, type CletusAI, type CletusAIContext } from '../ai';
import { getOperationInput } from '../operations/types';
import { createDBASchemas } from '../helpers/dba';
import { CONSTS } from '../constants';
import { TypeDefinition } from '../schemas';

/**
 * Determine if string schema should be used based on number of types
 */
function shouldUseStringSchema(types: TypeDefinition[]): boolean {
  return types.length > CONSTS.MAX_QUERY_SCHEMA_TYPES;
}

/**
 * Create static DBA tools.
 * Returns an array of tools that can be registered in the tool registry.
 */
export function createDBATools(ai: CletusAI) {

  const dataIndex = ai.tool({
    name: 'data_index',
    description: 'Index records of a type for knowledge base',
    instructions: `Use this to (re)index records of a data type into the knowledge base for improved search and retrieval. 
This should be done if an embedding model has changed or a knowledge template has changed.

Example: Index all records of a type:
{ "type": "task" }
 
{{modeInstructions}}`,
    schema: ({ config }) => z.object({
      type: z.enum(config.getData().types.map(t => t.name) as [string, ...string[]]).describe('Type name to index'),
      ...globalToolProperties,
    }),
    input: getOperationInput('data_index'),
    applicable: ({ config }) => config.getData().types.length > 0,
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_index', input }, ctx as unknown as CletusAIContext),
  });

  const dataImport = ai.tool({
    name: 'data_import',
    description: 'Import records from files into a data type',
    instructions: `Use this to import records from files. The tool will:
1. Find files matching the glob pattern
2. Process readable files (text, PDF, Excel, Word documents)
3. Extract structured data using AI with schema validation
4. Determine unique fields automatically to avoid duplicates
5. Merge data, updating existing records or creating new ones

Example: Import from CSV or text files:
{ "type": "task", "glob": "data/*.csv" }

Example: Import with image text extraction:
{ "type": "document", "glob": "documents/**/*.pdf", "transcribeImages": true }
 
{{modeInstructions}}`,
    schema: ({ config }) => z.object({
      type: z.enum(config.getData().types.map(t => t.name) as [string, ...string[]]).describe('Type name to import into'),
      glob: z.string().describe('Glob pattern for files to import (e.g., "data/*.csv", "**/*.txt")'),
      transcribeImages: z.boolean().optional().describe('Extract text from images in documents (default: false)'),
      ...globalToolProperties,
    }),
    input: getOperationInput('data_import'),
    applicable: ({ config }) => config.getData().types.length > 0,
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_import', input }, ctx as unknown as CletusAIContext),
  });
    
  const dataSearch = ai.tool({
    name: 'data_search',
    description: 'Search records by semantic similarity',
    instructions: `Use this to find relevant records from the knowledge base using semantic search. Provide a type, query text, and optionally specify the number of results.

Example: Search for relevant records:
{ "type": "task", "query": "user preferences for notifications", "n": 5 }
 
{{modeInstructions}}`,
    schema: ({ config }) => z.object({
      type: z.enum(config.getData().types.map(t => t.name) as [string, ...string[]]).describe('Type name to search'),
      query: z.string().describe('Search query text'),
      n: z.number().optional().describe('Maximum results (default: 10)'),
      ...globalToolProperties,
    }),
    input: getOperationInput('data_search'),
    applicable: ({ config }) => config.getData().types.length > 0,
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_search', input }, ctx as unknown as CletusAIContext),
  });

  const dataGet = ai.tool({
    name: 'data_get',
    description: 'Get paginated records of a data type',
    instructions: `Use this for simple paged data retrieval. Returns a page of records and the total count for a given type.

If any filtering, sorting, or complex operations are needed for accuracy, use the query tool instead.

Example: Get first 10 records:
{ "type": "task" }

Example: Get records 20-30:
{ "type": "task", "offset": 20, "limit": 10 }

{{modeInstructions}}`,
    schema: ({ config }) => z.object({
      type: z.enum(config.getData().types.map(t => t.name) as [string, ...string[]]).describe('Type name to retrieve records from'),
      offset: z.number().optional().describe('Number of records to skip (default: 0)'),
      limit: z.number().optional().describe('Maximum records to return (default: 10)'),
      ...globalToolProperties,
    }),
    input: getOperationInput('data_get'),
    applicable: ({ config }) => config.getData().types.length > 0,
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_get', input }, ctx as unknown as CletusAIContext),
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

{{queryFormat}}

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

Example 4: Simple INSERT with constant values:
{
  "kind": "insert",
  "table": "users",
  "columns": ["name", "email", "age"],
  "values": ["Alice Smith", "alice@example.com", 30]
}

Example 5: INSERT with ON CONFLICT:
{
  "kind": "insert",
  "table": "users",
  "columns": ["email", "name"],
  "values": ["bob@example.com", "Bob Jones"],
  "onConflict": {
    "columns": ["email"],
    "update": [{ "column": "name", "value": "Bob Jones" }]
  }
}

Example 6: INSERT from SELECT:
{
  "kind": "insert",
  "table": "archive_users",
  "columns": ["name", "email"],
  "select": {
    "kind": "select",
    "values": [
      { "alias": "name", "value": { "source": "users", "column": "name" } },
      { "alias": "email", "value": { "source": "users", "column": "email" } }
    ],
    "from": { "kind": "table", "table": "users" },
    "where": [{ "kind": "comparison", "left": { "source": "users", "column": "active" }, "cmp": "=", "right": false }]
  }
}

Example 7: UPDATE with WHERE:
{
  "kind": "update",
  "table": "users",
  "set": [
    { "column": "active", "value": false },
    { "column": "deactivatedAt", "value": { "kind": "function", "function": "now", "args": [] } }
  ],
  "where": [{ "kind": "comparison", "left": { "source": "users", "column": "lastLogin" }, "cmp": "<", "right": "2023-01-01" }]
}

Example 8: DELETE with WHERE:
{
  "kind": "delete",
  "table": "temp_data",
  "where": [{ "kind": "comparison", "left": { "source": "temp_data", "column": "created" }, "cmp": "<", "right": "2024-01-01" }]
}

Example 9: SELECT all columns using * wildcard:
{
  "kind": "select",
  "values": [{ "alias": "all", "value": { "source": "users", "column": "*" } }],
  "from": { "kind": "table", "table": "users" },
  "limit": 10
}

Example 10: SELECT with * and additional specific columns:
{
  "kind": "select",
  "values": [
    { "alias": "all", "value": { "source": "users", "column": "*" } },
    { "alias": "fullName", "value": { "kind": "binary", "left": { "source": "users", "column": "firstName" }, "op": "+", "right": { "source": "users", "column": "lastName" } } }
  ],
  "from": { "kind": "table", "table": "users" }
}

{{modeInstructions}}`,
    schema: ({ config }) => {
      const types = config.getData().types;
      const useStringSchema = shouldUseStringSchema(types);
      
      return z.object({
        ...(useStringSchema ? {
          query: z.string().describe('A detailed description of the query to execute. Must include: the operation (SELECT/INSERT/UPDATE/DELETE), which types/tables are involved, any filter conditions, known record IDs if applicable, and the precise outcome desired. Be specific and comprehensive.'),
        } : {
          query: z.union([
            createDBASchemas(types).QuerySchema,
            z.string().describe('A detailed description of the query to execute')
          ]).describe('The query to execute - either a structured Query object or a string description'),
        }),
        ...globalToolProperties,
      });
    },
    input: ({ config }) => {
      const types = config.getData().types;
      const useStringSchema = shouldUseStringSchema(types);
      
      return {
        queryFormat: useStringSchema
          ? 'The query must be a string description that includes all necessary details: the operation to perform (SELECT/INSERT/UPDATE/DELETE), which types/tables to query, filter conditions, known record IDs if applicable, and the precise outcome desired.'
          : 'The query can be either:\n1. A structured JSON object representing SQL operations\n2. A string description of the query - must include all necessary details: the operation to perform, which types/tables to query, filter conditions, known record IDs if applicable, and the precise outcome desired',
        ...getOperationInput('query')(config),
      };
    },
    applicable: ({ config }) => config.getData().types.length > 0,
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'query', input }, ctx as unknown as CletusAIContext),
  });

  return [
    dataIndex,
    dataImport,
    dataSearch,
    dataGet,
    dbaQuery,
  ] as [
    typeof dataIndex,
    typeof dataImport,
    typeof dataSearch,
    typeof dataGet,
    typeof dbaQuery,
  ];
}
