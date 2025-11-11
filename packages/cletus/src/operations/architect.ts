import Handlebars from 'handlebars';
import { operationOf } from "./types";
import { ConfigFile } from "../config";
import type { TypeDefinition, TypeField } from "../schemas";


function validateTemplate(template: string, fields: TypeField[]): string | true {
  try {
    const compiled = Handlebars.compile(template);
    // Test with sample data based on fields
    const testData: Record<string, any> = {};

    for (const field of fields) {
      testData[field.name] = field.default ?? (
        field.type === 'string' ? '' :
        field.type === 'number' ? 0 :
        field.type === 'boolean' ? false :
        field.type === 'date' ? new Date().toISOString() :
        field.type === 'enum' ? (field.enumOptions?.[0] ?? '') :
        ''
      );
    }

    compiled(testData);

    return true;
  } catch (error: any) {
    return `Invalid knowledge template: ${error.message}`;
  }
}


export const type_info = operationOf<
  { name: string },
  { type: TypeDefinition | null }
>({
  mode: 'local',
  status: (input) => `Getting type info: ${input.name}`,
  analyze: async (input, { config }) => {
    return {
      analysis: `This will get information about data type "${input.name}".`,
      doable: true,
    };
  },
  do: async (input, { config }) => {
    const types = config.getData().types;
    const type = types.find((t) => t.name === input.name);
    return { type: type || null };
  },
});

type TypeUpdate = { name: string; update: { friendlyName?: string; description?: string; knowledgeTemplate?: string; fields?: Record<string, Partial<TypeField> | null> } };

export const type_update = operationOf<
  TypeUpdate,
  { name: string; updated: boolean }
>({
  mode: 'update',
  status: (input) => `Updating type: ${input.name}`,
  validate(input: TypeUpdate, config: ConfigFile): string {
    const existing = config.getData().types.find((t) => t.name === input.name);
    if (!existing) {
      return `Type not found: ${input.name}`;
    }

    // Validate knowledgeTemplate if provided
    if (input.update.knowledgeTemplate) {
      const validation = validateTemplate(input.update.knowledgeTemplate, existing.fields);
      if (validation !== true) {
        return validation;
      }
    }

    // Validate field updates if provided
    if (input.update.fields) {
      for (const [fieldName, fieldUpdate] of Object.entries(input.update.fields)) {
        if (fieldUpdate === null) {
          // Deleting a field - check if it's required (breaking change)
          const existingField = existing.fields.find((f) => f.name === fieldName);
          if (existingField?.required) {
            return `Cannot delete required field "${fieldName}" - this is a breaking change`;
          }
        } else {
          // Adding or updating a field
          const existingField = existing.fields.find((f) => f.name === fieldName);

          if (existingField) {
            // Updating existing field - check for breaking changes
            if (fieldUpdate.type && fieldUpdate.type !== existingField.type) {
              return `Cannot change type of field "${fieldName}" from "${existingField.type}" to "${fieldUpdate.type}" - this is a breaking change`;
            }
            if (fieldUpdate.required && !existingField.required && !fieldUpdate.default && !existingField.default) {
              return `Cannot make field "${fieldName}" required without a default value - this is a breaking change`;
            }
          } else {
            // Adding new field - ensure it has required properties
            if (!fieldUpdate.type) {
              return `New field "${fieldName}" must have a type`;
            }
            if (fieldUpdate.friendlyName === undefined) {
              return `New field "${fieldName}" must have a friendlyName`;
            }
            if (fieldUpdate.required && !fieldUpdate.default) {
              return `New required field "${fieldName}" must have a default value`;
            }
          }
        }
      }
    }

    return '';
  },
  async analyze(input, { config }) {
    const validation = this.validate(input, config);
    if (validation) {
      return {
        analysis: `This would fail - ${validation}`,
        doable: false,
      };
    }
    
    const changes: string[] = [];
    if (input.update.friendlyName) {
      changes.push(`friendlyName to "${input.update.friendlyName}"`);
    }
    if (input.update.description) {
      changes.push(`description to "${input.update.description}"`);
    }
    if (input.update.knowledgeTemplate) {
      changes.push(`knowledgeTemplate to "${input.update.knowledgeTemplate}"`);
    }
    if (input.update.fields) {
      changes.push(`field updates`);
    }

    return {
      analysis: `This will update type "${input.name}": ${changes.join(', ')}.`,
      doable: true,
    };
  },
  async do(input, { config }) {
    const validation = this.validate(input, config);
    if (validation) {
      throw new Error(`Type update failed - ${validation}`);
    }
    
    await config.save((data) => {
      const dataType = data.types.find((t) => t.name === input.name);
      if (dataType) {
        if (input.update.friendlyName) {
          dataType.friendlyName = input.update.friendlyName;
        }
        if (input.update.description) {
          dataType.description = input.update.description;
        }
        if (input.update.knowledgeTemplate) {
          dataType.knowledgeTemplate = input.update.knowledgeTemplate;
        }

        // Handle field updates
        if (input.update.fields) {
          for (const [fieldName, fieldUpdate] of Object.entries(input.update.fields)) {
            if (fieldUpdate === null) {
              // Delete field
              const fieldIndex = dataType.fields.findIndex((f) => f.name === fieldName);
              if (fieldIndex !== -1) {
                dataType.fields.splice(fieldIndex, 1);
              }
            } else {
              // Update or add field
              const existingField = dataType.fields.find((f) => f.name === fieldName);
              if (existingField) {
                // Update existing field
                Object.assign(existingField, fieldUpdate);
              } else {
                // Add new field (must provide full field definition)
                if (fieldUpdate.type && fieldUpdate.friendlyName !== undefined) {
                  dataType.fields.push({
                    name: fieldName,
                    friendlyName: fieldUpdate.friendlyName,
                    type: fieldUpdate.type,
                    required: fieldUpdate.required ?? false,
                    default: fieldUpdate.default,
                    enumOptions: fieldUpdate.enumOptions,
                  });
                }
              }
            }
          }
        }
      }
    });

    return { name: input.name, updated: true };
  },
});

export const type_create = operationOf<
  TypeDefinition,
  { type: TypeDefinition; created: boolean }
>({
  mode: 'create',
  status: (input) => `Creating type: ${input.name}`,
  validate(input: TypeDefinition, config: ConfigFile): string {
    const existing = config.getData().types.find((t) => t.name === input.name);
    if (existing) {
      return `Type already exists: ${input.name}`;
    }

    // Validate fields for duplicates and required properties
    const fieldNames = new Set<string>();
    for (const field of input.fields) {
      if (fieldNames.has(field.name)) {
        return `Duplicate field name: "${field.name}"`;
      }
      fieldNames.add(field.name);

      if (!field.name) {
        return `Field must have a name`;
      }
      if (!field.friendlyName) {
        return `Field "${field.name}" must have a friendlyName`;
      }
      if (!field.type) {
        return `Field "${field.name}" must have a type`;
      }
      if (field.type === 'enum' && (!field.enumOptions || field.enumOptions.length === 0)) {
        return `Enum field "${field.name}" must have enumOptions`;
      }
      if (field.required && !field.default) {
        return `Required field "${field.name}" must have a default value`;
      }
    }

    // Validate knowledgeTemplate
    if (input.knowledgeTemplate) {
      const validation = validateTemplate(input.knowledgeTemplate, input.fields);
      if (validation !== true) {
        return validation;
      }
    }

    return '';
  },
  async analyze(input, { config }) {
    const validation = this.validate(input, config);
    
    if (validation) {
      return {
        analysis: `This would fail - ${validation}`,
        doable: false,
      };
    }

    return {
      analysis: `This will create a new data type: ${JSON.stringify(input, undefined, 2)}`,
      doable: true,
    };
  },
  async do(input, { config }) {
    const validation = this.validate(input, config);
    if (validation) {
      throw new Error(`Type creation failed - ${validation}`);
    }
    
    await config.addType(input);

    return { type: input, created: true };
  },
});
