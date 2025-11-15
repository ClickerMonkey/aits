import z from "zod";
import { TypeDefinition, TypeField } from "../schemas";
import { FieldCondition, WhereClause } from "./data";

/**
 * Generate example field values based on field type
 */
export function getExampleValue(field: TypeField): string {
  switch (field.type) {
    case 'string':
      return field.enumOptions ? `"${field.enumOptions[0]}"` : '"Example text"';
    case 'number':
      return '42';
    case 'boolean':
      return 'true';
    case 'enum':
      return `"${field.enumOptions?.[0] || 'option1'}"`;
    case 'date':
      return '"2024-01-15"';
    default:
      return '"ref-id-123"';
  }
}

/**
 * Generate example fields object for documentation
 */
export function generateExampleFields(fields: TypeField[], includeAll: boolean = false): string {
  const exampleFields = fields
    .filter(f => includeAll || f.required || Math.random() > 0.5)
    .slice(0, 3)
    .map(f => `"${f.name}": ${getExampleValue(f)}`)
    .join(', ');
  return `{ ${exampleFields} }`;
}

/**
 * Generate example where clause for a type
 */
export function generateExampleWhere(field: TypeField): string {
  switch (field.type) {
    case 'string':
      return `{ "${field.name}": { "equals": "example" } }`;
    case 'number':
      return `{ "${field.name}": { "gte": 5 } }`;
    case 'boolean':
      return `{ "${field.name}": { "equals": true } }`;
    case 'enum':
      return `{ "${field.name}": { "equals": "${field.enumOptions?.[0] || 'option1'}" } }`;
    case 'date':
      return `{ "${field.name}": { "after": "2024-01-01" } }`;
    default:
      return `{ "${field.name}": { "equals": "id-123" } }`;
  }
}

/**
 * Build a Zod schema from a TypeField definition
 */
export function buildFieldSchema(field: TypeField): z.ZodTypeAny {
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
export function buildFieldsSchema(typeDef: TypeDefinition) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of typeDef.fields) {
    shape[field.name] = buildFieldSchema(field);
  }
  return z.object(shape);
}

/**
 * Build a where clause schema that supports field equality, and/or logic
 */
export function buildWhereSchema(typeDef: TypeDefinition) {
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


export function getSchemas(type: TypeDefinition, cache: Record<string, any> = {}): Record<string, any> {
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
