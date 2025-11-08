import { z } from 'zod';
import type { CletusAI, CletusAIContext } from '../ai.js';
import type { TypeDefinition, TypeField } from '../schemas.js';
import { FieldCondition, WhereClause } from '../operations/where-helpers.js';
import { AI, AIContextInfer, AITypes, ContextInfer } from '@aits/ai';

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
      schema = z.iso.date();
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
  const fieldConditions: Record<string, z.ZodType<FieldCondition | undefined>> = {};

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
          equals: z.iso.date().optional(),
          before: z.iso.date().optional(),
          after: z.iso.date().optional(),
          oneOf: z.array(z.iso.date()).optional(),
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


function getSchemas(type: TypeDefinition, cache: Record<string, any> = {}): Record<string, any> {
  const cacheKey = `${type.name}Schemas`;
  let schemas: {
    fields: ReturnType<typeof buildFieldsSchema>;
    where: ReturnType<typeof buildWhereSchema>;
    fieldNames: z.ZodEnum<Record<string, string>>;
  } = cache[cacheKey];

  if (!schemas) {
    schemas = {
      fields: buildFieldsSchema(type),
      fieldNames: z.enum(type.fields.map(f => f.name) as [string, ...string[]]),
      where: buildWhereSchema(type),
    };
    cache[cacheKey] = schemas;
  }

  return schemas;
};

/**
 * Create the DBA agent that identifies the type first, then creates specific tools.
 */
export function createDBAAgent(ai: CletusAI) {
  const aiTyped = ai.extend<{ type: TypeDefinition }>();

  type A = ContextInfer<typeof ai>;
  type B = AIContextInfer<typeof ai>;
  type X = ContextInfer<typeof aiTyped>;
  type Y = AIContextInfer<typeof aiTyped>;
  type C = X extends A ? true : false;

  type Z<T extends A> = true
  type W = Z<X>;

  const dataCreate = aiTyped.tool({
    name: 'data_create',
    description: `Create a new record`,
    descriptionFn: ({ type }) => `Create a new ${type.friendlyName} record`,
    instructionsFn: ({ type }) => `Use this to create a new ${type.friendlyName}. ${type.description || ''}\n\nFields:\n${type.fields.map(f => `- ${f.friendlyName} (${f.name}): ${f.type}${f.required ? ' [required]' : ''}${f.default !== undefined ? ` [default: ${f.default}]` : ''}`).join('\n')}`,
    schema: ({ type, cache }) => z.object({
      fields: getSchemas(type, cache).fields.describe('Field values for the new record'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_create', input: { name: ctx.type.name, fields: input.fields } }, ctx),
  });

  const dataUpdate = aiTyped.tool({
    name: 'data_update',
    description: `Update a record by ID`,
    descriptionFn: ({ type }) => `Update a ${type.friendlyName} record by ID`,
    instructionsFn: ({ type }) => `Use this to update specific fields in an existing ${type.friendlyName}. Only provide fields you want to change.`,
    schema: ({ type, cache }) => z.object({
      id: z.string().describe('Record ID'),
      fields: getSchemas(type, cache).fields.partial().describe('Fields to update'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_update', input: { name: ctx.type.name, id: input.id, fields: input.fields } }, ctx),
  });

  const dataDelete = aiTyped.tool({
    name: 'data_delete',
    description: `Delete a record by ID`,
    descriptionFn: ({ type }) => `Delete a ${type.friendlyName} record by ID`,
    instructionsFn: ({ type }) => `Use this to permanently delete a ${type.friendlyName}.`,
    schema: z.object({
      id: z.string().describe('Record ID'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_delete', input: { name: ctx.type.name, id: input.id } }, ctx),
  });

  const dataSelect = aiTyped.tool({
    name: 'data_select',
    description: `Query records`,
    descriptionFn: ({ type }) => `Query ${type.friendlyName} records`,
    instructionsFn: ({ type }) => `Use this to search and retrieve ${type.friendlyName} records. Supports:
- where: Filter by field values with and/or logic
- offset/limit: Pagination
- orderBy: Sort by field(s)

Available fields: ${type.fields.map(f => `${f.name} (${f.type})`).join(', ')}`,
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
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_select', input: { name: ctx.type.name, ...input } }, ctx),
  });

  const dataUpdateMany = aiTyped.tool({
    name: 'data_update_many',
    description: `Update multiple records`,
    descriptionFn: ({ type }) => `Update multiple ${type.friendlyName} records`,
    instructionsFn: ({ type }) => `Use this to bulk update ${type.friendlyName} records that match a where clause.`,
    schema: ({ type, cache }) => z.object({
      set: getSchemas(type, cache).fields.partial().describe('Fields to set on matching records'),
      where: getSchemas(type, cache).where.optional().describe('Filter conditions'),
      limit: z.number().optional().describe('Maximum records to update'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_update_many', input: { name: ctx.type.name, ...input } }, ctx),
  });

  const dataDeleteMany = aiTyped.tool({
    name: 'data_delete_many',
    description: `Delete multiple records`,
    descriptionFn: ({ type }) => `Delete multiple ${type.friendlyName} records`,
    instructionsFn: ({ type }) =>  `Use this to bulk delete ${type.friendlyName} records that match a where clause.`,
    schema: ({ type, cache }) => z.object({
      where: getSchemas(type, cache).where.describe('Filter conditions'),
      limit: z.number().optional().describe('Maximum records to delete'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_delete_many', input: { name: ctx.type.name, ...input } }, ctx),
  });

  const dataAggregate = aiTyped.tool({
    name: 'data_aggregate',
    description: `Perform aggregation queries`,
    descriptionFn: ({ type }) => `Perform aggregation queries on ${type.friendlyName}`,
    instructionsFn: ({ type }) => `Use this for analytics and reporting on ${type.friendlyName} data:
- groupBy: Group by field(s)
- where: Filter before aggregation
- having: Filter after aggregation
- select: Aggregation functions (count, sum, avg, min, max)
- orderBy: Sort results

Available fields: ${type.fields.map(f => `${f.name} (${f.type})`).join(', ')}`,
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
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'data_aggregate', input: { name: ctx.type.name, ...input } }, ctx),
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

Use the available tools to complete the data operation requested in the conversation.`,
    tools: [
      dataCreate,
      dataUpdate,
      dataDelete,
      dataSelect,
      dataUpdateMany,
      dataDeleteMany,
      dataAggregate,
    ],
    input: (_: {}, { userPrompt, type }) => ({ userPrompt, type }),
  });

  return dba;
}
