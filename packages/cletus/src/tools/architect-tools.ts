import { z } from 'zod';
import type { CletusAI } from '../ai.js';

/**
 * Create architect tools for type definition management
 */
export function createArchitectTools(ai: CletusAI) {
  const configData = ai.config.defaultContext!.config!.getData();
  const types = configData.types.map((t) => t.name);

  const fieldType = z.enum(['string', 'number', 'boolean', 'date', 'enum', ...types]).describe('Field type (custom types are allowed)');

  const typeInfo = ai.tool({
    name: 'type_info',
    description: 'Get all information about a type definition',
    instructions: 'Use this to see the full schema of a custom data type including all fields and their properties.',
    schema: z.object({
      name: z.string().describe('Type name'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'type_info', input }, ctx),
  });

  const typeUpdate = ai.tool({
    name: 'type_update',
    description: 'Update a type definition in a backwards compatible way',
    instructions: `Use this to modify an existing type definition. You MUST ensure backwards compatibility:
- Never change field types (breaking change)
- Never remove required fields (breaking change)
- Never make optional fields required without a default value (breaking change)
- You CAN add new fields (if required, must have default), update descriptions, update knowledgeTemplate, or delete optional fields
Provide an update object with the changes to make.`,
    schema: z.object({
      name: z.string().describe('Type name'),
      update: z.object({
        friendlyName: z.string().optional().describe('New friendly name'),
        description: z.string().optional().describe('New description'),
        knowledgeTemplate: z.string().optional().describe('New Handlebars template for knowledge generation, ie: {{name}} and {{#if field}}...{{/if}}. It should include all fields and if the fields are optional #if statements should be used. Newlines & markdown can be used for formatting.'),
        fields: z.record(
          z.string(),
          z.union([
            z.null(),
            z.object({
              friendlyName: z.string().optional(),
              type: fieldType.optional(),
              required: z.boolean().optional(),
              default: z.union([z.string(), z.number(), z.boolean()]).optional(),
              enumOptions: z.array(z.string()).optional(),
            })
          ])
        ).optional().describe('Field updates: set to null to delete, object to add/update'),
      }).describe('Updates to apply'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'type_update', input }, ctx),
  });

  const typeCreate = ai.tool({
    name: 'type_create',
    description: 'Create a new type definition',
    instructions: 'Use this to define a new custom data type with fields. Each field should have a name, friendlyName, and type. Required fields must have a default value.',
    schema: z.object({
      name: z.string().describe('Type name (lowercase, no spaces)'),
      friendlyName: z.string().describe('Display name'),
      description: z.string().optional().describe('Type description'),
      knowledgeTemplate: z.string().describe('Handlebars template for knowledge generation, ie: {{name}} and {{#if field}}...{{/if}}. It should include all fields and if the fields are optional #if statements should be used. Newlines & markdown can be used for formatting.'),
      fields: z.array(
        z.object({
          name: z.string().describe('Field name (lowecase, no spaces)'),
          friendlyName: z.string().describe('Field display name'),
          type: fieldType,
          default: z.union([z.string(), z.number(), z.boolean()]).optional().describe('Default value'),
          required: z.boolean().optional().describe('Is field required?'),
          enumOptions: z.array(z.string()).optional().describe('Valid enum values (required for enum type)'),
        })
      ).describe('Field definitions'),
    }),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'type_create', input }, ctx),
  });

  return [
    typeInfo,
    typeUpdate,
    typeCreate,
  ] as [
    typeof typeInfo,
    typeof typeUpdate,
    typeof typeCreate,
  ];
}
