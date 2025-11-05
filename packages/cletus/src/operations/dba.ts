import { CletusCoreContext } from "../ai";
import { operationOf } from "./types";
import { DataManager } from "../data";
import { WhereClause, filterByWhere, countByWhere } from "./where-helpers";

export const data_create = operationOf<
  { name: string; fields: any },
  { id: string; name: string }
>({
  mode: 'create',
  analyze: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      return {
        analysis: `This would fail - data type "${input.name}" not found.`,
        doable: false,
      };
    }

    const fieldNames = Object.keys(input.fields);
    return {
      analysis: `This will create a new ${type.friendlyName} record with fields: ${fieldNames.join(', ')}.`,
      doable: true,
    };
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
      return {
        analysis: `This would fail - data type "${input.name}" not found.`,
        doable: false,
      };
    }

    const dataManager = new DataManager(input.name);
    await dataManager.load();
    const record = dataManager.getById(input.id);

    if (!record) {
      return {
        analysis: `This would fail - ${type.friendlyName} record "${input.id}" not found.`,
        doable: false,
      };
    }

    const fieldNames = Object.keys(input.fields);
    return {
      analysis: `This will update ${type.friendlyName} record "${input.id}" with fields: ${fieldNames.join(', ')}.`,
      doable: true,
    };
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
      return {
        analysis: `This would fail - data type "${input.name}" not found.`,
        doable: false,
      };
    }

    const dataManager = new DataManager(input.name);
    await dataManager.load();
    const record = dataManager.getById(input.id);

    if (!record) {
      return {
        analysis: `This would fail - ${type.friendlyName} record "${input.id}" not found.`,
        doable: false,
      };
    }

    return {
      analysis: `This will delete ${type.friendlyName} record "${input.id}".`,
      doable: true,
    };
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
  { name: string; where?: WhereClause; offset?: number; limit?: number; orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }> },
  { count: number; results: any[] }
>({
  mode: 'local',
  analyze: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      return {
        analysis: `This would fail - data type "${input.name}" not found.`,
        doable: false,
      };
    }

    const dataManager = new DataManager(input.name);
    await dataManager.load();

    let records = dataManager.getAll();
    if (input.where) {
      records = filterByWhere(records, input.where);
    }

    const limit = input.limit || 10;
    const offset = input.offset || 0;

    return {
      analysis: `This will query ${type.friendlyName} records: ${records.length} matching records, returning ${Math.min(limit, Math.max(0, records.length - offset))} (limit: ${limit}, offset: ${offset}).`,
      doable: true,
    };
  },
  do: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      throw new Error(`Data type not found: ${input.name}`);
    }

    const dataManager = new DataManager(input.name);
    await dataManager.load();

    let results = dataManager.getAll();

    // Apply where clause
    if (input.where) {
      results = filterByWhere(results, input.where);
    }

    // Apply ordering
    if (input.orderBy && input.orderBy.length > 0) {
      results.sort((a, b) => {
        for (const order of input.orderBy!) {
          const aVal = a.fields[order.field];
          const bVal = b.fields[order.field];

          if (aVal < bVal) return order.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return order.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    const offset = input.offset || 0;
    const limit = input.limit || 10;

    return {
      count: results.length,
      results: results.slice(offset, offset + limit),
    };
  },
});

export const data_update_many = operationOf<
  { name: string; set: any; where: WhereClause },
  { updated: number }
>({
  mode: 'update',
  analyze: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      return {
        analysis: `This would fail - data type "${input.name}" not found.`,
        doable: false,
      };
    }

    const dataManager = new DataManager(input.name);
    await dataManager.load();

    const matchingCount = countByWhere(dataManager.getAll(), input.where);

    const setFields = Object.keys(input.set);
    return {
      analysis: `This will bulk update ${matchingCount} ${type.friendlyName} record(s) matching criteria, setting: ${setFields.join(', ')}.`,
      doable: true,
    };
  },
  do: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      throw new Error(`Data type not found: ${input.name}`);
    }

    const dataManager = new DataManager(input.name);
    await dataManager.load();

    const matchingRecords = filterByWhere(dataManager.getAll(), input.where);

    // Update all matching records
    await Promise.all(matchingRecords.map((record) =>
      dataManager.update(record.id, input.set)
    ));

    return { updated: matchingRecords.length };
  },
});

export const data_delete_many = operationOf<
  { name: string; where: WhereClause },
  { deleted: number }
>({
  mode: 'delete',
  analyze: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      return {
        analysis: `This would fail - data type "${input.name}" not found.`,
        doable: false,
      };
    }

    const dataManager = new DataManager(input.name);
    await dataManager.load();

    const matchingCount = countByWhere(dataManager.getAll(), input.where);

    return {
      analysis: `This will bulk delete ${matchingCount} ${type.friendlyName} record(s) matching the specified criteria.`,
      doable: true,
    };
  },
  do: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      throw new Error(`Data type not found: ${input.name}`);
    }

    const dataManager = new DataManager(input.name);
    await dataManager.load();

    const matchingRecords = filterByWhere(dataManager.getAll(), input.where);

    // Delete all matching records
    await Promise.all(matchingRecords.map((record) =>
      dataManager.delete(record.id)
    ));

    return { deleted: matchingRecords.length };
  },
});

export const data_aggregate = operationOf<
  {
    name: string;
    where?: WhereClause;
    having?: WhereClause;
    groupBy?: string[];
    orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }>;
    select: Array<{ function: 'count' | 'sum' | 'avg' | 'min' | 'max'; field?: string; alias?: string }>;
  },
  { results: any[] }
>({
  mode: 'local',
  analyze: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      return {
        analysis: `This would fail - data type "${input.name}" not found.`,
        doable: false,
      };
    }

    const dataManager = new DataManager(input.name);
    await dataManager.load();

    let records = dataManager.getAll();
    if (input.where) {
      records = filterByWhere(records, input.where);
    }

    return {
      analysis: `This will perform an aggregation query on ${records.length} ${type.friendlyName} record(s).`,
      doable: true,
    };
  },
  do: async (input, { config }) => {
    const type = config.getData().types.find((t) => t.name === input.name);
    if (!type) {
      throw new Error(`Data type not found: ${input.name}`);
    }

    const dataManager = new DataManager(input.name);
    await dataManager.load();

    let records = dataManager.getAll();

    // Apply where clause
    if (input.where) {
      records = filterByWhere(records, input.where);
    }

    // Group records if groupBy is specified
    const groups: Map<string, any[]> = new Map();

    if (input.groupBy && input.groupBy.length > 0) {
      for (const record of records) {
        const key = input.groupBy.map((field) => record.fields[field]).join('|');
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(record);
      }
    } else {
      groups.set('*', records);
    }

    // Compute aggregations for each group
    const results: any[] = [];

    for (const [key, groupRecords] of groups.entries()) {
      const result: any = {};

      // Add group by fields
      if (input.groupBy && input.groupBy.length > 0) {
        const keyParts = key.split('|');
        input.groupBy.forEach((field, i) => {
          result[field] = keyParts[i];
        });
      }

      // Compute aggregation functions
      for (const agg of input.select) {
        const alias = agg.alias || `${agg.function}_${agg.field || '*'}`;

        switch (agg.function) {
          case 'count':
            result[alias] = groupRecords.length;
            break;

          case 'sum':
            if (agg.field) {
              result[alias] = groupRecords.reduce((sum, r) => sum + (Number(r.fields[agg.field!]) || 0), 0);
            }
            break;

          case 'avg':
            if (agg.field) {
              const sum = groupRecords.reduce((sum, r) => sum + (Number(r.fields[agg.field!]) || 0), 0);
              result[alias] = groupRecords.length > 0 ? sum / groupRecords.length : 0;
            }
            break;

          case 'min':
            if (agg.field) {
              const values = groupRecords.map((r) => r.fields[agg.field!]).filter((v) => v !== null && v !== undefined);
              result[alias] = values.length > 0 ? Math.min(...values.map(Number)) : null;
            }
            break;

          case 'max':
            if (agg.field) {
              const values = groupRecords.map((r) => r.fields[agg.field!]).filter((v) => v !== null && v !== undefined);
              result[alias] = values.length > 0 ? Math.max(...values.map(Number)) : null;
            }
            break;
        }
      }

      results.push(result);
    }

    // Apply having clause (post-aggregation filter)
    // Note: This would require evaluating the where clause on the aggregated results
    // For simplicity, skipping this for now

    // Apply ordering
    if (input.orderBy && input.orderBy.length > 0) {
      results.sort((a, b) => {
        for (const order of input.orderBy!) {
          const aVal = a[order.field];
          const bVal = b[order.field];

          if (aVal < bVal) return order.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return order.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return { results };
  },
});
