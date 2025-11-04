import { CletusCoreContext } from "../ai";
import { operationOf } from "./types";
import { DataManager } from "../data";

export const data_create = operationOf<
  { name: string; fields: any },
  { id: string; name: string }
>({
  mode: 'create',
  analyze: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      return `This would fail - data type "${input.name}" not found.`;
    }

    const fieldNames = Object.keys(input.fields);
    return `This will create a new ${type.friendlyName} record with fields: ${fieldNames.join(', ')}.`;
  },
  do: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      throw new Error(`Data type not found: ${input.name}`);
    }

    const dataManager = new DataManager(input.name);
    await dataManager.load();
    const id = await dataManager.create(input.fields);

    return { id, name: input.name };
  },
});

export const data_update = operationOf<
  { name: string; id: string; fields: any },
  { id: string; updated: boolean }
>({
  mode: 'update',
  analyze: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      return `This would fail - data type "${input.name}" not found.`;
    }

    const fieldNames = Object.keys(input.fields);
    return `This will update ${type.friendlyName} record "${input.id}" with fields: ${fieldNames.join(', ')}.`;
  },
  do: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      throw new Error(`Data type not found: ${input.name}`);
    }

    const dataManager = new DataManager(input.name);
    await dataManager.load();
    await dataManager.update(input.id, input.fields);

    return { id: input.id, updated: true };
  },
});

export const data_delete = operationOf<
  { name: string; id: string },
  { id: string; deleted: boolean }
>({
  mode: 'delete',
  analyze: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      return `This would fail - data type "${input.name}" not found.`;
    }

    return `This will delete ${type.friendlyName} record "${input.id}".`;
  },
  do: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      throw new Error(`Data type not found: ${input.name}`);
    }

    const dataManager = new DataManager(input.name);
    await dataManager.load();
    await dataManager.delete(input.id);

    return { id: input.id, deleted: true };
  },
});

export const data_select = operationOf<
  { name: string; where?: any; offset?: number; limit?: number; orderBy?: any[] },
  { count: number; results: any[] }
>({
  mode: 'read',
  analyze: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      return `This would fail - data type "${input.name}" not found.`;
    }

    const limit = input.limit || 10;
    const offset = input.offset || 0;

    return `This will query ${type.friendlyName} records (limit: ${limit}, offset: ${offset}).`;
  },
  do: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      throw new Error(`Data type not found: ${input.name}`);
    }

    const dataManager = new DataManager(input.name);
    await dataManager.load();

    // TODO: Implement proper query logic with where/orderBy
    let results = dataManager.getAll();

    const offset = input.offset || 0;
    const limit = input.limit || 10;

    return {
      count: results.length,
      results: results.slice(offset, offset + limit),
    };
  },
});

export const data_update_many = operationOf<
  { name: string; set: any; where: any },
  { updated: number }
>({
  mode: 'update',
  analyze: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      return `This would fail - data type "${input.name}" not found.`;
    }

    const setFields = Object.keys(input.set);
    return `This will bulk update ${type.friendlyName} records matching criteria, setting: ${setFields.join(', ')}.`;
  },
  do: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      throw new Error(`Data type not found: ${input.name}`);
    }

    const dataManager = new DataManager(input.name);
    await dataManager.load();

    // TODO: Implement bulk update with where clause
    return { updated: 0 };
  },
});

export const data_delete_many = operationOf<
  { name: string; where: any },
  { deleted: number }
>({
  mode: 'delete',
  analyze: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      return `This would fail - data type "${input.name}" not found.`;
    }

    return `This will bulk delete ${type.friendlyName} records matching the specified criteria.`;
  },
  do: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      throw new Error(`Data type not found: ${input.name}`);
    }

    const dataManager = new DataManager(input.name);
    await dataManager.load();

    // TODO: Implement bulk delete with where clause
    return { deleted: 0 };
  },
});

export const data_aggregate = operationOf<
  { name: string; where?: any; having?: any; groupBy?: string[]; orderBy?: any[]; select?: any[] },
  { results: any[] }
>({
  mode: 'read',
  analyze: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      return `This would fail - data type "${input.name}" not found.`;
    }

    return `This will perform an aggregation query on ${type.friendlyName} records.`;
  },
  do: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      throw new Error(`Data type not found: ${input.name}`);
    }

    const dataManager = new DataManager(input.name);
    await dataManager.load();

    // TODO: Implement aggregation
    return { results: [] };
  },
});
