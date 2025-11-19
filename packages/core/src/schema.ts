import z, { json } from 'zod';
import { tr } from 'zod/locales';


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

type StrictTransformer = (schema: z.ZodType | z.core.$ZodType) => z.ZodType;

/**
* Recursively transforms a Zod schema to support strict mode.
* 
* @param schema - input Zod schema
* @returns transformed Zod schema
*/
export function strictify(schema: z.ZodType): z.ZodType {
  const map = new Map<z.ZodType | z.core.$ZodType, z.ZodType | (() => z.ZodType)>();

  const transform: StrictTransformer = (s) => {
    const cached = map.get(s);
    if (cached) {
      if (typeof cached === 'function') {
        return z.lazy(cached);
      } else {
        return cached;
      }
    }
    let result: z.ZodType;
    map.set(s, () => result);
    result = strictifySimple(s, transform);
    map.set(s, result);
    return result;
  };

  return transform(schema);
}

/**
* Recursively transforms a Zod schema to support strict mode.
* 
* @param schema - input Zod schema
* @returns transformed Zod schema
*/
function strictifySimple(
  schema: z.ZodType | z.core.$ZodType,
  transform: StrictTransformer,
): z.ZodType {
  // Handle ZodOptional - get the inner schema and make it optional
  if (schema instanceof z.ZodOptional) {
    const transformed = transform(schema.unwrap());
    return transferMetadata(
      z.codec(
        transformed.nullable(),
        transformed.optional(),
        {
          decode: (val) => val === null ? undefined : val,
          encode: (val) => val === undefined ? null : val,
        }
      ), 
      schema
    );
  }

  // Handle ZodObject
  if (schema instanceof z.ZodObject) {
    const transformedShape: Record<string, z.ZodType> = {};
    for (const key in schema.shape) {
      transformedShape[key] = transform(schema.shape[key]);
    }
    return transferMetadata(
      z.object(transformedShape), 
      schema
    );
  }

  // Handle ZodCodec
  if (schema instanceof z.ZodCodec) {
    return transferMetadata(
      z.codec(
        transform(schema.def.in), 
        transform(schema.def.out),
        {
          encode: schema.def.transform,
          decode: schema.def.reverseTransform,
        }
      ),
      schema
    );
  }

  // Handle ZodPipe
  if (schema instanceof z.ZodPipe) {
    return transferMetadata(
      z.pipe(
        transform(schema.def.in),
        transform(schema.def.out),
      ),
      schema
    );
  }
  
  // Handle ZodNullable
  if (schema instanceof z.ZodNullable) {
    return transferMetadata(
      transform(schema.unwrap()).nullable(), 
      schema
    );
  }
  
  // Handle ZodArray
  if (schema instanceof z.ZodArray) {
    return transferMetadata(
      z.array(transform(schema.element)), 
      schema
    );
  }
  
  // Handle ZodRecord
  if (schema instanceof z.ZodRecord) {
    const key = schema.keyType ? transform(schema.keyType) as z.ZodType<PropertyKey, PropertyKey> : z.string();
    const value = transform(schema.valueType);

    return transferMetadata(
      z.codec(
        z.array(z.object({ key, value })),
        z.record(key, value),
        {
          decode: (arr) => {
            const record: Record<PropertyKey, any> = {};
            for (const { key, value } of arr) {
              record[key as PropertyKey] = value;
            } 
            return record;
          },
          encode: (rec) => Object.entries(rec).map(
            ([key, value]) => ({ key, value })
          ),
        }
      ), 
      schema
    );
  }
  
  // Handle ZodUnion
  if (schema instanceof z.ZodUnion) {
    return transferMetadata(
      z.union(schema.options.map(transform) as [z.ZodType, ...z.ZodType[]]), 
      schema
    );
  }
  
  // Handle ZodDiscriminatedUnion
  if (schema instanceof z.ZodDiscriminatedUnion) {
    return transferMetadata(
      z.discriminatedUnion(schema.def.discriminator, schema.options.map(transform) as [any, ...any[]]), 
      schema
    );
  }
  
  // Handle ZodIntersection
  if (schema instanceof z.ZodIntersection) {
    return transferMetadata(
      z.intersection(transform(schema.def.left), transform(schema.def.right)), 
      schema
    );
  }
  
  // Handle ZodTuple
  if (schema instanceof z.ZodTuple) {
    return transferMetadata(
      z.tuple(schema.def.items.map(transform) as [z.ZodType, ...z.ZodType[]]), 
      schema
    );
  }
  
  // Handle ZodEffects (transforms, refines, etc.)
  if (schema instanceof z.ZodDefault) {
     return z.preprocess(
      (val) => val === null ? undefined : val,
      transferMetadata(
        transform(schema.def.innerType).default(schema.def.defaultValue),
        schema
      ),
    );
  }
  
  // Handle ZodLazy
  if (schema instanceof z.ZodLazy) {
    return transferMetadata(
      z.lazy(() => transform(schema.def.getter())), 
      schema
    );
  }
  
  // For all other types (primitives, etc.), return as-is
  return schema as z.ZodType;
}

/**
 * Override function to modify JSON Schema generation
 * to make optional fields accept null values.
 */
const typeOverride = ({ jsonSchema }: { 
  zodSchema: z.core.$ZodTypes,
  jsonSchema: z.core.JSONSchema.BaseSchema,
  path: (string | number)[];
}) => {
  if (jsonSchema.type === 'object') {
    const properties = jsonSchema.properties || {};
    const propertyKeys = Object.keys(properties);
    const required = jsonSchema.required || [];
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
    
    jsonSchema.required = propertyKeys;
    jsonSchema.additionalProperties = false;
  }
  if (jsonSchema.allOf?.length) {
    if (jsonSchema.allOf.length === 1) {
      if (Object.keys(jsonSchema).length === 1) {
        Object.assign(jsonSchema, jsonSchema.allOf[0]);
      } else {
        jsonSchema.anyOf = jsonSchema.allOf;
      }
      delete jsonSchema.allOf;
    }
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
    reused: 'ref',
    io: 'input',
    unrepresentable: 'any',
    override: strict ? typeOverride : undefined,
  })
}