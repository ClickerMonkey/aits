import { z } from 'zod';
import type { CletusAI } from '../ai.js';
import type { TypeDefinition, TypeField } from '../schemas.js';

/**
 * Build a Zod schema from a TypeField definition
 */
function buildFieldSchema(field: TypeField): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (field.type) {
    case 'string':
      schema = z.string();
      break;
    case 'number':
      schema = z.number();
      break;
    case 'boolean':
      schema = z.boolean();
      break;
    case 'enum':
      schema = z.enum(field.enumOptions as [string, ...string[]]);
      break;
    case 'date':
      schema = z.string().datetime();
      break;
    default:
      schema = z.string();
      break;
  }

  if (!field.required) {
    schema = schema.optional();
  }

  if (field.default !== undefined) {
    schema = schema.default(field.default);
  }

  return schema;
}

/**
 * Build a Zod object schema for a type's fields
 */
function buildFieldsSchema(typeDef: TypeDefinition) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of typeDef.fields) {
    shape[field.name] = buildFieldSchema(field);
  }
  return z.object(shape);
}

/**
 * Build a where clause schema that supports field equality, and/or logic
 */
function buildWhereSchema(typeDef: TypeDefinition) {
  const fieldConditions: Record<string, z.ZodTypeAny> = {};

  // Each field can be matched by value
  for (const field of typeDef.fields) {
    switch (field.type) {
      case 'string':
        fieldConditions[field.name] = z.object({
          equals: z.string().optional(),
          contains: z.string().optional(),
          startsWith: z.string().optional(),
          endsWith: z.string().optional(),
          oneOf: z.array(z.string()).optional(),
          isEmpty: z.boolean().optional(),
        }).optional();
        break;
      case 'number':
        fieldConditions[field.name] = z.object({
          equals: z.number().optional(),
          lt: z.number().optional(),
          lte: z.number().optional(),
          gt: z.number().optional(),
          gte: z.number().optional(),
          oneOf: z.array(z.number()).optional(),
          isEmpty: z.boolean().optional(),
        }).optional();
        break;
      case 'boolean':
        fieldConditions[field.name] = z.object({
          equals: z.boolean().optional(),
          isEmpty: z.boolean().optional(),
        }).optional();
        break;
      case 'date':
        fieldConditions[field.name] = z.object({
          equals: z.string().datetime().optional(),
          before: z.string().datetime().optional(),
          after: z.string().datetime().optional(),
          oneOf: z.array(z.string().datetime()).optional(),
          isEmpty: z.boolean().optional(),
        }).optional();
        break;
      case 'enum':
        const enumSchema = z.enum(field.enumOptions as [string, ...string[]]);
        fieldConditions[field.name] = z.object({
          equals: enumSchema.optional(),
          oneOf: z.array(enumSchema).optional(),
          isEmpty: z.boolean().optional(),
        }).optional();
        break;
      default:
        // references a data type
        fieldConditions[field.name] = z.object({
          equals: z.string().optional(),
          oneOf: z.array(z.string()).optional(),
          isEmpty: z.boolean().optional(),
        }).optional();
        break;
    }
  }

  // Define the where clause recursively supporting and/or
  const whereSchema: z.ZodType<WhereClause> = z.lazy(() =>
    z.object({
      and: z.array(whereSchema).optional(),
      or: z.array(whereSchema).optional(),
      not: whereSchema.optional(),
      ...fieldConditions,
    })
  );

  return whereSchema;
}

/**
 * Where clause type definition
 */
type WhereClause = {
  and?: WhereClause[];
  or?: WhereClause[];
  not?: WhereClause;
  [key: string]: {
    equals?: string | number | boolean;
    contains?: string;
    startsWith?: string;
    endsWith?: string;
    lt?: number;
    lte?: number;
    gt?: number;
    gte?: number;
    oneOf?: (string | number | boolean)[];
    isEmpty?: boolean;
  } | WhereClause | WhereClause[] | undefined ;
};

/**
 * Create DBA tools for a specific data type
 * This is called dynamically after the type is identified
 */
export function createDBAToolsForType(ai: CletusAI, typeDef: TypeDefinition) {
  const fieldsSchema = buildFieldsSchema(typeDef);
  const whereSchema = buildWhereSchema(typeDef);
  const partialFieldsSchema = fieldsSchema.partial();

  const dataCreate = ai.tool({
    name: 'data_create',
    description: `Create a new ${typeDef.friendlyName} record`,
    instructions: `Use this to create a new ${typeDef.friendlyName}. ${typeDef.description || ''}\n\nFields:\n${typeDef.fields.map(f => `- ${f.friendlyName} (${f.name}): ${f.type}${f.required ? ' [required]' : ''}${f.default !== undefined ? ` [default: ${f.default}]` : ''}`).join('\n')}`,
    schema: z.object({
      fields: fieldsSchema.describe('Field values for the new record'),
    }),
    call: async (params, refs, ctx) => {
      return await ctx.ops.handle({
        type: 'data_create',
        input: {
          name: typeDef.name,
          fields: params.fields,
        }
      }, ctx);
    },
  });

  const dataUpdate = ai.tool({
    name: 'data_update',
    description: `Update a ${typeDef.friendlyName} record by ID`,
    instructions: `Use this to update specific fields in an existing ${typeDef.friendlyName}. Only provide fields you want to change.`,
    schema: z.object({
      id: z.string().describe('Record ID'),
      fields: partialFieldsSchema.describe('Fields to update'),
    }),
    call: async (params, refs, ctx) => {
      return await ctx.ops.handle({
        type: 'data_update',
        input: {
          name: typeDef.name,
          id: params.id,
          fields: params.fields,
        }
      }, ctx);
    },
  });

  const dataDelete = ai.tool({
    name: 'data_delete',
    description: `Delete a ${typeDef.friendlyName} record by ID`,
    instructions: `Use this to permanently delete a ${typeDef.friendlyName}.`,
    schema: z.object({
      id: z.string().describe('Record ID'),
    }),
    call: async (params, refs, ctx) => {
      return await ctx.ops.handle({
        type: 'data_delete',
        input: {
          name: typeDef.name,
          id: params.id,
        }
      }, ctx);
    },
  });

  const dataSelect = ai.tool({
    name: 'data_select',
    description: `Query ${typeDef.friendlyName} records`,
    instructions: `Use this to search and retrieve ${typeDef.friendlyName} records. Supports:
- where: Filter by field values with and/or logic
- offset/limit: Pagination
- orderBy: Sort by field(s)

Available fields: ${typeDef.fields.map(f => `${f.name} (${f.type})`).join(', ')}`,
    schema: z.object({
      where: whereSchema.optional().describe('Filter conditions with and/or logic'),
      offset: z.number().optional().default(0).describe('Starting position'),
      limit: z.number().optional().default(10).describe('Maximum results'),
      orderBy: z.array(
        z.object({
          field: z.enum(typeDef.fields.map(f => f.name) as [string, ...string[]]),
          direction: z.enum(['asc', 'desc']).default('asc'),
        })
      ).optional().describe('Sort order'),
    }),
    call: async (params, refs, ctx) => {
      return await ctx.ops.handle({
        type: 'data_select',
        input: {
          name: typeDef.name,
          where: params.where,
          offset: params.offset,
          limit: params.limit,
          orderBy: params.orderBy,
        }
      }, ctx);
    },
  });

  const dataUpdateMany = ai.tool({
    name: 'data_update_many',
    description: `Update multiple ${typeDef.friendlyName} records`,
    instructions: `Use this to bulk update ${typeDef.friendlyName} records that match a where clause.`,
    schema: z.object({
      set: partialFieldsSchema.describe('Fields to set on matching records'),
      where: whereSchema.describe('Filter conditions'),
      limit: z.number().optional().describe('Maximum records to update'),
    }),
    call: async (params, refs, ctx) => {
      return await ctx.ops.handle({
        type: 'data_update_many',
        input: {
          name: typeDef.name,
          set: params.set,
          where: params.where,
          limit: params.limit,
        }
      }, ctx);
    },
  });

  const dataDeleteMany = ai.tool({
    name: 'data_delete_many',
    description: `Delete multiple ${typeDef.friendlyName} records`,
    instructions: `Use this to bulk delete ${typeDef.friendlyName} records that match a where clause.`,
    schema: z.object({
      where: whereSchema.describe('Filter conditions'),
      limit: z.number().optional().describe('Maximum records to delete'),
    }),
    call: async (params, refs, ctx) => {
      return await ctx.ops.handle({
        type: 'data_delete_many',
        input: {
          name: typeDef.name,
          where: params.where,
          limit: params.limit,
        }
      }, ctx);
    },
  });

  const dataAggregate = ai.tool({
    name: 'data_aggregate',
    description: `Perform aggregation queries on ${typeDef.friendlyName}`,
    instructions: `Use this for analytics and reporting on ${typeDef.friendlyName} data:
- groupBy: Group by field(s)
- where: Filter before aggregation
- having: Filter after aggregation
- select: Aggregation functions (count, sum, avg, min, max)
- orderBy: Sort results

Available fields: ${typeDef.fields.map(f => `${f.name} (${f.type})`).join(', ')}`,
    schema: z.object({
      where: whereSchema.optional().describe('Pre-aggregation filter'),
      having: whereSchema.optional().describe('Post-aggregation filter'),
      groupBy: z.array(
        z.enum(typeDef.fields.map(f => f.name) as [string, ...string[]])
      ).optional().describe('Fields to group by'),
      orderBy: z.array(
        z.object({
          field: z.string(),
          direction: z.enum(['asc', 'desc']).default('asc'),
        })
      ).optional().describe('Sort order'),
      select: z.array(
        z.object({
          function: z.enum(['count', 'sum', 'avg', 'min', 'max']),
          field: z.enum(typeDef.fields.map(f => f.name) as [string, ...string[]]).optional(),
          alias: z.string().optional(),
        })
      ).describe('Aggregation functions'),
    }),
    call: async (params, refs, ctx) => {
      return await ctx.ops.handle({
        type: 'data_aggregate',
        input: {
          name: typeDef.name,
          where: params.where,
          having: params.having,
          groupBy: params.groupBy,
          orderBy: params.orderBy,
          select: params.select,
        }
      }, ctx);
    },
  });

  return [
    dataCreate,
    dataUpdate,
    dataDelete,
    dataSelect,
    dataUpdateMany,
    dataDeleteMany,
    dataAggregate,
  ] as const;
}

/**
 * Create the DBA agent that identifies the type first, then creates specific tools
 */
export function createDBAAgent(ai: CletusAI) {
  // First, identify which type the user wants to work with
  const typeIdentifier = ai.prompt({
    name: 'identify_data_type',
    description: 'Identify which data type the user wants to operate on',
    content: `Based on the user's request, identify which data type they want to work with.

<userInformation>
{{userPrompt}}
</userInformation>

Respond with just the type name.`,
    schema: z.object({
      typeName: z.string().describe('The data type name'),
    }),
    input: (input, ctx) => ({ userPrompt: ctx.userPrompt }),
  });

  const dbaAgent = ai.agent({
    name: 'dba',
    description: 'Database administrator agent for data operations',
    refs: [typeIdentifier],
    call: async (input: { request: string }, [typeIdentifier], ctx) => {
      // Get the type name
      const result = await typeIdentifier.get({}, 'result', ctx);
      const typeDef = ctx.config.getData().types.find((t) => t.name === result.typeName);

      if (!typeDef) {
        throw new Error(`Type not found: ${result.typeName}`);
      }

      // Now create tools for this specific type
      const tools = createDBAToolsForType(ai, typeDef);

      // Create a prompt with the type-specific tools
      const dataPrompt = ai.prompt({
        name: 'data_operation',
        description: `Perform data operation on ${typeDef.friendlyName}`,
        content: `You are working with ${typeDef.friendlyName} data. ${typeDef.description || ''}

Fields:
{{#each fields}}
- {{this.friendlyName}} ({{this.name}}): {{this.type}}{{#if this.required}} [required]{{/if}}{{#if this.default}} [default: {{this.default}}]{{/if}}
{{/each}}

User request: {{request}}

Use the available tools to complete the data operation.`,
        tools: tools,
        schema: false,
        input: (input, ctx) => ({
          fields: typeDef.fields,
          request: input?.request || '',
        }),
      });

      // Execute the prompt with type-specific tools
      await dataPrompt.run({ request: input.request }, ctx);

      return { completed: true, type: typeDef.name };
    },
  });

  return dbaAgent;
}
