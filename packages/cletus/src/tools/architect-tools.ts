import { z } from 'zod';
import type { CletusAI } from '../ai.js';
import type { Operation } from '../schemas.js';

/**
 * Create architect tools for type definition management
 * Tools return operations that will be executed based on chat mode
 */
export function createArchitectTools(ai: CletusAI) {
  const typeInfo = ai.tool({
    name: 'type_info',
    description: 'Get all information about a type definition',
    instructions: 'Use this to see the full schema of a custom data type including all fields and their properties.',
    schema: z.object({
      name: z.string().describe('Type name'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'type_info',
        input: {
          name: params.name,
        },
        kind: 'read',
      };
    },
  });

  const typeUpdate = ai.tool({
    name: 'type_update',
    description: 'Update a type definition in a backwards compatible way',
    instructions: `Use this to modify an existing type definition. You MUST ensure backwards compatibility:
- Never change field names or types (except to make more flexible like string)
- Never change a field from optional to required if data exists
- Only add new fields, update descriptions, or make fields more flexible
Provide an update object with fields to change.`,
    schema: z.object({
      name: z.string().describe('Type name'),
      update: z.object({
        friendlyName: z.string().optional().describe('New friendly name'),
        description: z.string().optional().describe('New description'),
        fields: z.record(z.any()).optional().describe('Field updates: set to null to delete, object to add/update'),
      }).describe('Updates to apply'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'type_update',
        input: {
          name: params.name,
          update: params.update,
        },
        kind: 'update',
      };
    },
  });

  const typeCreate = ai.tool({
    name: 'type_create',
    description: 'Create a new type definition',
    instructions: 'Use this to define a new custom data type with fields. Each field should have a name, friendlyName, type, and optionally default value, required flag, and enum options.',
    schema: z.object({
      definition: z.object({
        name: z.string().describe('Type name (lowercase, no spaces)'),
        friendlyName: z.string().describe('Display name'),
        description: z.string().optional().describe('Type description'),
        fields: z.array(
          z.object({
            name: z.string().describe('Field name'),
            friendlyName: z.string().describe('Field display name'),
            type: z.string().describe('Field type (string, number, boolean)'),
            default: z.union([z.string(), z.number(), z.boolean()]).optional().describe('Default value'),
            required: z.boolean().optional().describe('Is field required?'),
            enumOptions: z.array(z.string()).optional().describe('Valid enum values'),
          })
        ).describe('Field definitions'),
      }).describe('Type definition'),
    }),
    call: async (params, refs, ctx): Promise<Operation> => {
      return {
        type: 'type_create',
        input: params.definition,
        kind: 'create',
      };
    },
  });

  return [
    typeInfo,
    typeUpdate,
    typeCreate,
  ];
}
