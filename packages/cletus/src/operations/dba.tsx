import { after } from "node:test";
import { formatName } from "../common";
import { ConfigFile } from "../config";
import { DataManager } from "../data";
import { TypeDefinition } from "../schemas";
import { renderOperation } from "./render-helpers";
import { operationOf } from "./types";
import { FieldCondition, WhereClause, countByWhere, filterByWhere } from "./where-helpers";


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
  status: ({ name }) => `Creating ${name} record`,
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
  render: (op, config) => {
    const type = getType(config, op.input.name);
    const firstField = Object.keys(op.input.fields)[0];
    const additionalCount = Object.keys(op.input.fields).length - 1;
    const more = additionalCount > 0 ? `, +${additionalCount} more` : '';
    
    return renderOperation(
      op,
      `${formatName(type.friendlyName)}Create("${op.input.fields[firstField]}"${more})`,
      (op) => {
        if (op.output) {
          return `Created record ID: ${op.output.id}`;
        }
        return null;
      }
    );
  },
});

export const data_update = operationOf<
  { name: string; id: string; fields: Record<string, any> },
  { id: string; updated: boolean }
>({
  mode: 'update',
  status: ({ name, id }) => `Updating ${name}: ${id.slice(0, 8)}`,
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
  render: (op, config) => {
    const type = getType(config, op.input.name);
    const fields = type.fields.filter(f => f.name in op.input.fields).map(f => f.friendlyName);
    
    return renderOperation(
      op,
      `${formatName(type.friendlyName)}Update(${fields.map(f => `"${f}"`).join(', ')})`,
      (op) => {
        if (op.output?.updated) {
          return `Updated record ID: ${op.output.id}`;
        }
        return null;
      }
    );
  },
});

export const data_delete = operationOf<
  { name: string; id: string },
  { id: string; deleted: boolean }
>({
  mode: 'delete',
  status: ({ name, id }) => `Deleting ${name}: ${id.slice(0, 8)}`,
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
  render: (op, config) => {
    const type = getType(config, op.input.name);

    return renderOperation(
      op,
      `${formatName(type.friendlyName)}Delete("${op.input.id.slice(0, 8)}")`,
      (op) => {
        if (op.output?.deleted) {
          return `Deleted record ID: ${op.output.id}`;
        }
        return null;
      }
    );
  },
});

export const data_select = operationOf<
  { name: string; where?: WhereClause; offset?: number; limit?: number; orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }> },
  { count: number; results: any[] }
>({
  mode: 'local',
  status: ({ name }) => `Selecting ${name} records`,
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
  render: (op, config) => {
    const type = getType(config, op.input.name);
    const where = op.input.where ? `where=${Object.keys(op.input.where).join(',')}` : ''
    const limit = op.input.limit ? `limit=${op.input.limit}` : '';
    const offset = op.input.offset ? `offset=${op.input.offset}` : '';
    const orderBy = op.input.orderBy ? `orderBy=${op.input.orderBy.map(o => o.field).join(',')}` : '';
    const params = [where, limit, offset, orderBy].filter(p => p).join(', ');

    return renderOperation(
      op,
      `${formatName(type.friendlyName)}Select(${params})`,
      (op) => {
        if (op.output) {
          return `Returned ${op.output.results.length} of ${op.output.count} record(s)`;
        }
        return null;
      }
    );
  },
});

export const data_update_many = operationOf<
  { name: string; set: Record<string, any>; where: WhereClause; limit?: number },
  { updated: number }
>({
  mode: 'update',
  status: ({ name }) => `Updating multiple ${name} records`,
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
  render: (op, config) => {
    const type = getType(config, op.input.name);
    const set = 'set=' + Object.keys(op.input.set).join(',');
    const where = op.input.where ? `where=${Object.keys(op.input.where).join(',')}` : ''
    const limit = op.input.limit ? `limit=${op.input.limit}` : '';
    const params = [set, where, limit].filter(p => p).join(', ');

    return renderOperation(
      op,
      `${formatName(type.friendlyName)}UpdateMany(${params})`,
      (op) => {
        if (op.output) {
          return `Updated ${op.output.updated} record(s)`;
        }
        return null;
      }
    );
  },
});

export const data_delete_many = operationOf<
  { name: string; where: WhereClause; limit?: number },
  { deleted: number }
>({
  mode: 'delete',
  status: ({ name }) => `Deleting multiple ${name} records`,
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
  render: (op, config) => {
    const type = getType(config, op.input.name);
    const where = op.input.where ? `where=${whereString(op.input.where)}` : ''
    const limit = op.input.limit ? `limit=${op.input.limit}` : '';
    const params = [where, limit].filter(p => p).join(', ');

    return renderOperation(
      op,
      `${formatName(type.friendlyName)}DeleteMany(${params})`,
      (op) => {
        if (op.output) {
          return `Deleted ${op.output.deleted} record(s)`;
        }
        return null;
      }
    );
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
  status: ({ name }) => `Aggregating ${name} records`,
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
            if (agg.field) {
              // Count non-null values for specific field
              result[alias] = groupRecords.filter((r) => r.fields[agg.field!] !== null && r.fields[agg.field!] !== undefined).length;
            } else {
              // Count all records in group (count(*))
              result[alias] = groupRecords.length;
            }
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
  render: (op, config) => {
    const type = getType(config, op.input.name);
    const where = op.input.where ? `where=${Object.keys(op.input.where).join(',')}` : ''
    const having = op.input.having ? `having=${Object.keys(op.input.having).join(',')}` : ''
    const groupBy = op.input.groupBy ? `groupBy=${op.input.groupBy.join(',')}` : ''
    const orderBy = op.input.orderBy ? `orderBy=${op.input.orderBy.map(o => o.field).join(',')}` : ''
    const select = 'select=' + op.input.select.map(s => s.function + (s.field ? `(${s.field})` : '')).join(',');
    const params = [where, having, groupBy, orderBy, select].filter(p => p).join(', ');
    
    return renderOperation(
      op,
      `${formatName(type.friendlyName)}Aggregate(${params})`,
      (op) => {
        if (op.output?.results) {
          const resultCount = op.output.results.length;
          const aggregations = op.input.select?.map((s: any) => s.function).join(', ') || 'aggregation';
          return `${resultCount} result${resultCount !== 1 ? 's' : ''} (${aggregations})`;
        }
        return null;
      }
    );
  },
});

function valueString(value: FieldCondition[keyof FieldCondition]): string {
  if (Array.isArray(value)) {
    return `(${value.map(v => typeof v === 'string' ? `"${v}"` : `${v}`).join(', ')})`;
  } else {
    return typeof value === 'string' ? `"${value}"` : `${value}`;
  }
}

function whereString(where: WhereClause | undefined): string {
  if (!where) {
    return '';
  }

  const conditions: string[] = [];
  for (const [field, condition] of Object.entries(where)) {
    switch (field) {
      case 'and':
      case 'or':
        const subConditions = (condition as WhereClause[]).map(subWhere => whereString(subWhere));
        conditions.push(`(${subConditions.join(` ${field.toUpperCase()} `)})`);
        break;
      case 'not':
        conditions.push(`NOT (${whereString(condition as WhereClause)})`);
        break;
      default:
        const fieldCondition = condition as FieldCondition;
        for (const [op, value] of Object.entries(fieldCondition)) {
          conditions.push(`${field} ${OPERATOR_MAP[op]} ${valueString(value)}`);
        }
        break;
    }
  }

  return conditions.length > 1
   ? `(${conditions.join(' AND ')})`
   : conditions[0];
}

const OPERATOR_MAP: Record<string, string> = {
  equals: "=",
  contains: " CONTAINS ",
  startsWith: " STARTS WITH ",
  endsWith: "E NDS WITH ", 
  lt: "<",
  lte: "≤",
  gt: ">",
  gte: "≥",
  before: "≤",
  after: "≥",
  oneOf: " one of ",
  isEmpty: "IS EMPTY",
};