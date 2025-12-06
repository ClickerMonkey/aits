import z from "zod";
import { TypeDefinition, TypeField } from "../schemas";
import { FieldCondition, WhereClause } from "./data";
import { ConfigFile } from "../config";

/**
 * Get a type definition by name from config
 */
export function getType(config: ConfigFile, typeName: string, optional?: false): TypeDefinition
export function getType(config: ConfigFile, typeName: string, optional: true): TypeDefinition | undefined
export function getType(config: ConfigFile, typeName: string, optional: boolean = false): TypeDefinition | undefined {
  const type = config.getData().types.find((t) => t.name === typeName);
  if (!type && !optional) {
    throw new Error(`Data type not found: ${typeName}`);
  }
  return type;
}

/**
 * Get the friendly name of a type, or return the type name if not found
 */
export function getTypeName(config: ConfigFile, typeName: string): string {
  return getType(config, typeName, true)?.friendlyName || typeName;
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
    schema = schema.nullable();
  }

  if (field.default !== undefined) {
    schema = schema.default(field.default);
  }

  return schema.meta({ aid: field.name });
}

/**
 * Build a Zod object schema for a type's fields
 */
export function buildFieldsSchema(type: TypeDefinition) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of type.fields) {
    shape[field.name] = buildFieldSchema(field);
  }
  return z.object(shape).meta({ aid: `${type.name}_fields` });
}