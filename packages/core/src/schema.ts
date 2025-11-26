import z from 'zod';


type StrictTransformer = (schema: z.ZodType | z.core.$ZodType) => z.ZodType;

/**
* Recursively transforms a Zod schema to support strict mode.
*
* @param schema - input Zod schema
* @returns transformed Zod schema
*/
export function strictify<S extends z.ZodType>(schema: S): S {
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

  return transform(schema) as S;
}

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
 * Extracts the input schema from a transformed schema (codec or preprocess).
 * For preprocess with optional, we need the nullable version for strict mode input.
 * This is needed when building input schemas that contain transformed fields.
 */
function getInputSchema(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodCodec) {
    return schema.def.in as z.ZodType;
  }
  // For ZodPipe (which preprocess creates), check if the output is optional
  // If so, we need to return a nullable version for the input schema
  if (schema instanceof z.ZodPipe) {
    const outputSchema = schema.def.out;
    if (outputSchema instanceof z.ZodOptional) {
      // The input from preprocess is already set up to handle null->undefined conversion
      // So we just need to make sure the base type accepts null
      return z.nullable(outputSchema.unwrap());
    }
  }
  return schema;
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
    const innerSchema = schema.unwrap();
    const transformed = transform(innerSchema);

    // Check if the inner schema is nullable
    // If it's nullable, don't convert null to undefined
    const isNullable = innerSchema instanceof z.ZodNullable;

    // Use a preprocess to convert null to undefined only for non-nullable schemas
    // This avoids issues with codec output validation in recursive schemas
    return transferMetadata(
      z.preprocess(
        (val) => (!isNullable && val === null) ? undefined : val,
        transformed.optional()
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
          decode: schema.def.transform,
          encode: schema.def.reverseTransform,
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
    const keyTransformed = schema.keyType ? transform(schema.keyType) as z.ZodType<PropertyKey, PropertyKey> : z.string();
    const valueTransformed = transform(schema.valueType);

    // For the input schema (array of {key, value}), use the input side of any codecs
    const key = getInputSchema(keyTransformed);
    const value = getInputSchema(valueTransformed);

    return transferMetadata(
      z.codec(
        z.array(z.object({ key, value })),
        z.record(keyTransformed, valueTransformed),
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
 * Modify a JSON Schema property to make it optional (accept null)
 * 
 * @param prop - input JSON Schema property
 * @returns 
 */
const makeOptional = (prop: z.core.JSONSchema.JSONSchema): z.core.JSONSchema.JSONSchema => {
  if (prop.type) {
    const values = Array.isArray(prop.type) ? prop.type : [prop.type];
    if (!values.includes('null')) {
      prop.type = [...values, 'null'] as any;
    }

    return prop;
  } else {
    const { title, description, default: defaultValue, ...rest } = prop;
    return {
      title,
      description,
      default: defaultValue,
      anyOf: [
        rest,
        { type: 'null' }
      ],
    };
  }
};

/**
 * Override function to modify JSON Schema generation
 * to make optional fields accept null values.
 */
const typeOverride = ({ zodSchema, jsonSchema, path }: {
  zodSchema: z.core.$ZodTypes,
  jsonSchema: z.core.JSONSchema.BaseSchema,
  path: (string | number)[];
}) => {
  if (jsonSchema.type === 'object' && zodSchema instanceof z.ZodObject) {
    const properties = jsonSchema.properties || {};
    const propertyKeys = Object.keys(properties);
    const required = jsonSchema.required || [];
    const optional = propertyKeys.filter((key) => !required.includes(key));

    // Add null to optional fields (those not in required array)
    for (const key of optional) {
      properties[key] = makeOptional(properties[key] as z.core.JSONSchema.JSONSchema);
    }

    // Check fields that are required - if they use preprocess with optional, add null
    for (const key of required) {
      const fieldSchema = zodSchema.shape[key];
      // Check if this is a ZodPipe (from preprocess) wrapping optional
      if (fieldSchema instanceof z.ZodPipe) {
        const outputSchema = fieldSchema.def.out;
        if (outputSchema instanceof z.ZodOptional) {
          properties[key] = makeOptional(properties[key] as z.core.JSONSchema.JSONSchema);
        }
      }
    }

    jsonSchema.required = propertyKeys;
    jsonSchema.additionalProperties = false;
  }
  // Convert allOf with single entry to that entry or anyOf. 
  // allOf is not supported by some AI schema parsers.
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
  // For anyOf with null, convert to type array
  if (jsonSchema.anyOf?.length === 2) {
    if (jsonSchema.anyOf[1].type === 'null'
      && Object.keys(jsonSchema.anyOf[1]).length === 1
      && jsonSchema.anyOf[0].type
      && !Array.isArray(jsonSchema.anyOf[0].type))
    {
      const first = jsonSchema.anyOf[0];
      const nullableType = [first.type!, 'null'] as any;
      delete jsonSchema.anyOf;
      Object.assign(jsonSchema, first);
      // Set type after assign to avoid it being overwritten
      jsonSchema.type = nullableType;
    }
  }
  // anyOf in an anyOf - flatten
  if (jsonSchema.anyOf?.length) {
    const newAnyOf: z.core.JSONSchema.JSONSchema[] = [];
    for (const subSchema of jsonSchema.anyOf) {
      if (subSchema.anyOf?.length) {
        newAnyOf.push(...subSchema.anyOf);
      } else {
        newAnyOf.push(subSchema);
      }
    }
    jsonSchema.anyOf = newAnyOf;
  }

  if (path.length === 0) {
    console.log('Transformed JSON Schema:', JSON.stringify(jsonSchema));
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
  });
}