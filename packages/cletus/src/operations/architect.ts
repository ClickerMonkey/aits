import { CletusCoreContext } from "../ai";
import { operationOf } from "./types";
import type { TypeDefinition, TypeField } from "../schemas";

export const type_info = operationOf<
  { name: string },
  { type: TypeDefinition | null }
>({
  mode: 'local',
  analyze: async (input, { config }) => {
    return `This will get information about data type "${input.name}".`;
  },
  do: async (input, { config }) => {
    const types = config.getData().types;
    const type = types.find((t) => t.name === input.name);
    return { type: type || null };
  },
});

export const type_update = operationOf<
  { name: string; update: { friendlyName?: string; description?: string; fields?: Record<string, Partial<TypeField> | null> } },
  { name: string; updated: boolean }
>({
  mode: 'update',
  analyze: async (input, { config }) => {
    const types = config.getData().types;
    const type = types.find((t) => t.name === input.name);

    if (!type) {
      return `This would fail - type "${input.name}" not found.`;
    }

    const changes: string[] = [];
    if (input.update.friendlyName) {
      changes.push(`friendlyName to "${input.update.friendlyName}"`);
    }
    if (input.update.description) {
      changes.push(`description to "${input.update.description}"`);
    }
    if (input.update.fields) {
      changes.push(`field updates`);
    }

    return `This will update type "${input.name}": ${changes.join(', ')}.`;
  },
  do: async (input, { config }) => {
    const types = config.getData().types;
    const type = types.find((t) => t.name === input.name);

    if (!type) {
      throw new Error(`Type not found: ${input.name}`);
    }

    // TODO: Validate backwards compatibility
    await config.save((data) => {
      const t = data.types.find((t) => t.name === input.name);
      if (t) {
        if (input.update.friendlyName) t.friendlyName = input.update.friendlyName;
        if (input.update.description) t.description = input.update.description;
        // TODO: Handle field updates with validation
      }
    });

    return { name: input.name, updated: true };
  },
});

export const type_create = operationOf<
  TypeDefinition,
  { name: string; created: boolean }
>({
  mode: 'create',
  analyze: async (input, { config }) => {
    const existing = config.getData().types.find((t) => t.name === input.name);
    if (existing) {
      return `This would fail - type "${input.name}" already exists.`;
    }

    const fieldCount = Object.keys(input.fields).length;
    return `This will create a new data type "${input.name}" (${input.friendlyName}) with ${fieldCount} fields.`;
  },
  do: async (input, { config }) => {
    const existing = config.getData().types.find((t) => t.name === input.name);
    if (existing) {
      throw new Error(`Type already exists: ${input.name}`);
    }

    await config.addType(input);
    return { name: input.name, created: true };
  },
});
