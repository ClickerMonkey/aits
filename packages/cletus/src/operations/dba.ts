import { get } from "http";
import { ConfigFile } from "../config";
import { DataManager } from "../data";
import { TypeDefinition } from "../schemas";
import { operationOf } from "./types";
import { WhereClause, countByWhere, filterByWhere } from "./where-helpers";


function getType(config: ConfigFile, typeName: string): TypeDefinition {
  const type = config.getData().types.find((t) => t.name === typeName);
  if (!type) {
    throw new Error(`Data type not found: ${typeName}`);
  }
  return type;
}


export const data_create = operationOf<
  { name: string; fields: Record<string, any> },
  { id: string; name: string }
>({
  mode: 'create',
  analyze: async ({ name, fields }, { config })=> {
    const type = getType(config, name);
    const fieldNames = Object.keys(fields);
    return {
      analysis: `This will create a new ${type.friendlyName} record with fields: ${fieldNames.join(', ')}.`,
      doable: true,
    };
  },
  do: async ({ name, fields }, { config }) => {
    const type = getType(config, name);
    const dataManager = new DataManager(name);
    await dataManager.load();
    const id = await dataManager.create(fields);

    return { id, name: type.name };
  },
});

export const data_update = operationOf<
  { name: string; id: string; fields: Record<string, any> },
  { id: string; updated: boolean }
>({
  mode: 'update',
  analyze: async ({ name, id, fields }, { config }) => {
    const type = getType(config, name);
    const dataManager = new DataManager(type.name);
    await dataManager.load();
    const record = dataManager.getById(id);

    if (!record) {
      return {
        analysis: `This would fail - ${type.friendlyName} record "${id}" not found.`,
        doable: false,
      };
    }

    const fieldNames = Object.keys(fields);
    return {
      analysis: `This will update ${type.friendlyName} record "${id}" with fields: ${fieldNames.join(', ')}.`,
      doable: true,
    };
  },
  do: async ({ name, id, fields }, { config }) => {
    const type = getType(config, name);
    const dataManager = new DataManager(name);
    await dataManager.load();
    await dataManager.update(id, fields);

    return { id, updated: true };
  },
});

export const data_delete = operationOf<
  { name: string; id: string },
  { id: string; deleted: boolean }
>({
  mode: 'delete',
  analyze: async ({ name, id }, { config }) => {
    const type = getType(config, name);
    const dataManager = new DataManager(name);
    await dataManager.load();
    const record = dataManager.getById(id);

    if (!record) {
      return {
        analysis: `This would fail - ${type.friendlyName} record "${id}" not found.`,
        doable: false,
      };
    }

    return {
      analysis: `This will delete ${type.friendlyName} record "${id}".`,
      doable: true,
    };
  },
  do: async ({ name, id }, { config }) => {
    const type = getType(config, name);
    const dataManager = new DataManager(type.name);
    await dataManager.load();
    await dataManager.delete(id);

    return { id, deleted: true };
  },
});

export const data_select = operationOf<
  { name: string; where?: WhereClause; offset?: number; limit?: number; orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }> },
  { count: number; results: any[] }
>({
  mode: 'local',
  analyze: async ({ name, where, offset, limit, orderBy }, { config }) => {
    const type = getType(config, name);
    const dataManager = new DataManager(name);
    await dataManager.load();

    let records = dataManager.getAll();
    if (where) {
      records = filterByWhere(records, where);
    }

    const recordOffset = offset || 0;
    const recordLimit = limit || (records.length - recordOffset);

    return {
      analysis: `This will query ${type.friendlyName} records: ${records.length} matching records, returning ${Math.min(recordLimit, Math.max(0, records.length - recordOffset))} (limit: ${recordLimit}, offset: ${recordOffset}).`,
      doable: true,
    };
  },
  do: async ({ name, where, offset, limit, orderBy }) => {
    const dataManager = new DataManager(name);
    await dataManager.load();

    let results = dataManager.getAll();

    // Apply where clause
    if (where) {
      results = filterByWhere(results, where);
    }

    // Apply ordering
    if (orderBy?.length) {
      results.sort((a, b) => {
        for (const order of orderBy!) {
          const aVal = a.fields[order.field];
          const bVal = b.fields[order.field];

          if (aVal < bVal) return order.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return order.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    const recordOffset = offset || 0;
    const recordLimit = limit || (results.length - recordOffset);

    return {
      count: results.length,
      results: results.slice(recordOffset, recordOffset + recordLimit),
    };
  },
});

export const data_update_many = operationOf<
  { name: string; set: Record<string, any>; where: WhereClause; limit?: number },
  { updated: number }
>({
  mode: 'update',
  analyze: async ({ name, limit, set, where }, { config }) => {
    const type = getType(config, name);
    const dataManager = new DataManager(name);
    await dataManager.load();

    const matchingCount = countByWhere(dataManager.getAll(), where);
    const actualCount = limit ? Math.min(matchingCount, limit) : matchingCount;

    const setFields = Object.keys(set);
    const limitText = limit ? ` (limited to ${limit})` : '';
    return {
      analysis: `This will bulk update ${actualCount} ${type.friendlyName} record(s) matching criteria${limitText}, setting: ${setFields.join(', ')}.`,
      doable: true,
    };
  },
  do: async ({ name, limit, set, where }) => {
    const dataManager = new DataManager(name);
    await dataManager.load();

    let matchingRecords = filterByWhere(dataManager.getAll(), where);

    // Apply limit if specified
    if (limit) {
      matchingRecords = matchingRecords.slice(0, limit);
    }

    // Update all matching records
    await Promise.all(matchingRecords.map((record) =>
      dataManager.update(record.id, set)
    ));

    return { updated: matchingRecords.length };
  },
});

export const data_delete_many = operationOf<
  { name: string; where: WhereClause; limit?: number },
  { deleted: number }
>({
  mode: 'delete',
  analyze: async ({ name, where, limit }, { config }) => {
    const type = getType(config, name);
    
    const dataManager = new DataManager(name);
    await dataManager.load();

    const matchingCount = countByWhere(dataManager.getAll(), where);
    const actualCount = limit ? Math.min(matchingCount, limit) : matchingCount;

    const limitText = limit ? ` (limited to ${limit})` : '';
    return {
      analysis: `This will bulk delete ${actualCount} ${type.friendlyName} record(s) matching the specified criteria${limitText}.`,
      doable: true,
    };
  },
  do: async ({ name, where, limit }) => {
    const dataManager = new DataManager(name);
    await dataManager.load();

    let matchingRecords = filterByWhere(dataManager.getAll(), where);

    // Apply limit if specified
    if (limit) {
      matchingRecords = matchingRecords.slice(0, limit);
    }

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
  analyze: async ({ name, where }, { config }) => {
    const type = getType(config, name);
    const dataManager = new DataManager(name);
    await dataManager.load();

    let records = dataManager.getAll();
    if (where) {
      records = filterByWhere(records, where);
    }

    // TODO better summarize the input

    return {
      analysis: `This will perform an aggregation query on ${records.length} ${type.friendlyName} record(s).`,
      doable: true,
    };
  },
  do: async ({ name, where, having, groupBy, select, orderBy }) => {
    const dataManager = new DataManager(name);
    await dataManager.load();

    let records = dataManager.getAll();

    // Apply where clause
    if (where) {
      records = filterByWhere(records, where);
    }

    // Group records if groupBy is specified
    const groups: Map<string, any[]> = new Map();

    if (groupBy?.length) {
      for (const record of records) {
        const key = groupBy.map((field) => record.fields[field]).join('|||');
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
      if (groupBy?.length) {
        const keyParts = key.split('|||');
        groupBy.forEach((field, i) => {
          result[field] = keyParts[i];
        });
      }

      // Compute aggregation functions
      for (const agg of select) {
        const alias = agg.alias || `${agg.function}_${agg.field || '*'}`;
        const numbers = groupRecords
          .map((r) => agg.field ? r.fields[agg.field] : null)
          .filter((v) => v !== null && v !== undefined)
          .map((v) => Number(v))
          .filter((v) => isFinite(v));

        switch (agg.function) {
          case 'count':
            const count = groupRecords.filter((r) => r.fields[agg.field!] !== null && r.fields[agg.field!] !== undefined).length;
            result[alias] = count;
            break;

          case 'sum':
            if (agg.field) {
              result[alias] = numbers.reduce((sum, n) => sum + n, 0);
            }
            break;

          case 'avg':
            if (agg.field) {
              const sum = numbers.reduce((sum, n) => sum + n, 0);
              result[alias] = numbers.length > 0 ? sum / numbers.length : 0;
            }
            break;

          case 'min':
            if (agg.field) {
              result[alias] = numbers.length > 0 ? Math.min(...numbers) : null;
            }
            break;

          case 'max':
            if (agg.field) {
              result[alias] = numbers.length > 0 ? Math.max(...numbers) : null;
            }
            break;
        }
      }

      results.push(result);
    }

    // TODO having

    // Apply ordering
    if (orderBy?.length) {
      results.sort((a, b) => {
        for (const order of orderBy) {
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
