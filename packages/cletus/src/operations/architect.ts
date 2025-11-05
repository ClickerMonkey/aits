import { operationOf } from "./types";
import { ConfigFile } from "../config";
import type { TypeDefinition, TypeField } from "../schemas";


export const type_info = operationOf<
  { name: string },
  { type: TypeDefinition | null }
>({
  mode: 'local',
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
  validate(input: TypeUpdate, config: ConfigFile): string {
    const existing = config.getData().types.find((t) => t.name === input.name);
    if (!existing) {
      return `Type not found: ${input.name}`;
    }

    // TODO: Validate backwards compatibility (check for breaking changes)
    // TODO: validate knowledgeTemplate (compile handlebars, generate empty object to test) if given

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
  validate(input: TypeDefinition, config: ConfigFile): string {
    const existing = config.getData().types.find((t) => t.name === input.name);
    if (existing) {
      throw new Error(`Type already exists: ${input.name}`);
    }

    // TODO validate fields (no duplicates, etc)
    // TODO validate knowledgeTemplate (compile handlebars, generate empty object to test)

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
