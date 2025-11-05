import type { DataRecord } from "../schemas";

/**
 * Where clause type definition matching dba-tools.ts structure
 */
export type WhereClause = {
  and?: WhereClause[];
  or?: WhereClause[];
  not?: WhereClause;
  [key: string]: FieldCondition | WhereClause | WhereClause[] | undefined;
};

export type FieldCondition = {
  equals?: string | number | boolean;
  contains?: string;
  startsWith?: string;
  endsWith?: string;
  lt?: number;
  lte?: number;
  gt?: number;
  gte?: number;
  before?: string;
  after?: string;
  oneOf?: (string | number | boolean)[];
  isEmpty?: boolean;
};

/**
 * Evaluate a where clause against a data record
 */
export function evaluateWhere(record: DataRecord, where: WhereClause): boolean {
  // Handle logical operators
  if (where.and) {
    return where.and.every((clause) => evaluateWhere(record, clause));
  }

  if (where.or) {
    return where.or.some((clause) => evaluateWhere(record, clause));
  }

  if (where.not) {
    return !evaluateWhere(record, where.not);
  }

  // Handle field conditions
  for (const [field, condition] of Object.entries(where)) {
    if (field === 'and' || field === 'or' || field === 'not' || !condition) {
      continue;
    }

    const fieldCondition = condition as FieldCondition;
    const value = record.fields[field];

    // isEmpty check
    if (fieldCondition.isEmpty !== undefined) {
      const empty = value === null || value === undefined || value === '';
      if (fieldCondition.isEmpty !== empty) {
        return false;
      }
      continue;
    }

    // equals check
    if (fieldCondition.equals !== undefined) {
      if (value !== fieldCondition.equals) {
        return false;
      }
    }

    // String operations
    if (typeof value === 'string') {
      if (fieldCondition.contains !== undefined && !value.includes(fieldCondition.contains)) {
        return false;
      }
      if (fieldCondition.startsWith !== undefined && !value.startsWith(fieldCondition.startsWith)) {
        return false;
      }
      if (fieldCondition.endsWith !== undefined && !value.endsWith(fieldCondition.endsWith)) {
        return false;
      }
    }

    // Number operations
    if (typeof value === 'number') {
      if (fieldCondition.lt !== undefined && value >= fieldCondition.lt) {
        return false;
      }
      if (fieldCondition.lte !== undefined && value > fieldCondition.lte) {
        return false;
      }
      if (fieldCondition.gt !== undefined && value <= fieldCondition.gt) {
        return false;
      }
      if (fieldCondition.gte !== undefined && value < fieldCondition.gte) {
        return false;
      }
    }

    // Date operations (assuming ISO date strings)
    if (fieldCondition.before !== undefined || fieldCondition.after !== undefined) {
      const dateValue = new Date(value as string);
      if (fieldCondition.before !== undefined) {
        const beforeDate = new Date(fieldCondition.before);
        if (dateValue >= beforeDate) {
          return false;
        }
      }
      if (fieldCondition.after !== undefined) {
        const afterDate = new Date(fieldCondition.after);
        if (dateValue <= afterDate) {
          return false;
        }
      }
    }

    // oneOf check
    if (fieldCondition.oneOf !== undefined) {
      if (!fieldCondition.oneOf.includes(value as any)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Filter records by where clause
 */
export function filterByWhere(records: DataRecord[], where: WhereClause): DataRecord[] {
  return records.filter((record) => evaluateWhere(record, where));
}

/**
 * Count records matching where clause
 */
export function countByWhere(records: DataRecord[], where: WhereClause): number {
  return filterByWhere(records, where).length;
}
