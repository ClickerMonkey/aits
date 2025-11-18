import z from 'zod';


/**
* Transfer description and metadata from source Zod schema to target Zod schema
* 
* @param target - target Zod schema
* @param source - source Zod schema
* @returns 
*/
function transferMetadata(target: z.ZodType, source: z.ZodType) {
  if (source.description) {
    target = target.describe(source.description);
  }
  const meta = source.meta();
  if (meta) {
    target = target.meta(meta);
  }
  return target;
}

/**
* Recursively transforms a Zod schema to support strict mode.
* 
* @param schema - input Zod schema
* @returns transformed Zod schema
*/
export function strictify(schema: z.ZodType | z.core.$ZodType): z.ZodType { 
  // Handle ZodOptional - get the inner schema and make it optional
  if (schema instanceof z.ZodOptional) {
    return z.preprocess(
      (val) => val === null ? undefined : val, 
      transferMetadata(strictify(schema.unwrap()).optional(), schema),
    );
  }
  
  // Handle ZodObject
  if (schema instanceof z.ZodObject) {
    const transformedShape: Record<string, z.ZodType> = {};
    for (const key in schema.shape) {
      const value: z.ZodType = schema.shape[key];
      const valueSchema = strictify(value);
      transformedShape[key] = valueSchema;
    }
    return transferMetadata(z.object(transformedShape), schema);
  }
  
  // Handle ZodNullable
  if (schema instanceof z.ZodNullable) {
    return transferMetadata(strictify(schema.unwrap()).nullable(), schema);
  }
  
  // Handle ZodArray
  if (schema instanceof z.ZodArray) {
    return transferMetadata(z.array(strictify(schema.element)), schema);
  }
  
  // Handle ZodRecord
  if (schema instanceof z.ZodRecord) {
    const key = schema.keyType ? strictify(schema.keyType) : z.string();
    const value = strictify(schema.valueType);

    return transferMetadata(z
      .array(z.object({ key, value }))
      .transform((keyValues) => {
        const record: Record<PropertyKey, any> = {};
        for (const { key, value } of keyValues) {
          record[key as PropertyKey] = value;
        }
        return record;
      }
    ), schema);
  }
  
  // Handle ZodUnion
  if (schema instanceof z.ZodUnion) {
    return transferMetadata(z.union(schema.options.map(strictify)), schema);
  }
  
  // Handle ZodDiscriminatedUnion
  if (schema instanceof z.ZodDiscriminatedUnion) {
    return transferMetadata(z.discriminatedUnion(schema.def.discriminator, schema.options.map(strictify) as [any, ...any[]]), schema);
  }
  
  // Handle ZodIntersection
  if (schema instanceof z.ZodIntersection) {
    return transferMetadata(z.intersection(strictify(schema.def.left), strictify(schema.def.right)), schema);
  }
  
  // Handle ZodTuple
  if (schema instanceof z.ZodTuple) {
    return transferMetadata(z.tuple(schema.def.items.map(strictify) as [z.ZodType, ...z.ZodType[]]), schema);
  }
  
  // Handle ZodEffects (transforms, refines, etc.)
  if (schema instanceof z.ZodDefault) {
    return transferMetadata(strictify(schema.def.innerType).default(schema.def.defaultValue), schema);
  }
  
  // Handle ZodLazy
  if (schema instanceof z.ZodLazy) {
    const inner = strictify(schema.def.getter());
    return transferMetadata(z.lazy(() => inner), schema);
  }
  
  // For all other types (primitives, etc.), return as-is
  return schema as z.ZodType;
}

/**
 * Override function to modify JSON Schema generation
 * to make optional fields accept null values.
 */
const typeOverride = (ctx: { 
  zodSchema: z.core.$ZodTypes,
  jsonSchema: z.core.JSONSchema.BaseSchema,
  path: (string | number)[];
}) => {
  if (ctx.jsonSchema.type === 'object') {
    const properties = ctx.jsonSchema.properties || {};
    const propertyKeys = Object.keys(properties);
    const required = ctx.jsonSchema.required || [];
    const optional = propertyKeys.filter((key) => !required.includes(key));
    
    for (const key of optional) {
      const { title, description, default: defaultValue, ...rest } = properties[key] as z.core.JSONSchema.JSONSchema;
      properties[key] = { 
        title,
        description,
        default: defaultValue,
        anyOf: [
          rest,
          { type: 'null' }
        ],
      };
    }
    
    ctx.jsonSchema.required = propertyKeys;
    ctx.jsonSchema.additionalProperties = false;
  }
};

/**
 * Converts a Zod schema to JSON Schema that's compatible with AI schemas.
 * 
 * @param schema - input Zod schema
 * @returns - JSON Schema object
 */
export function toJSONSchema(schema: z.ZodType, strict: boolean) {
  return z.toJSONSchema(schema, {
    target: 'draft-7',
    override: strict ? typeOverride : undefined,
    io: 'input',
    unrepresentable: 'any',
  })
}