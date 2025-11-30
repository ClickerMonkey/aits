import { DataManager } from "../data";
import { ConfigFile } from "../config";
import { DataRecord, TypeDefinition } from "../schemas";
import type {
  Query,
  Statement,
  CTEStatement,
  Select,
  Insert,
  Update,
  Delete,
  SetOperation,
  Value,
  BooleanValue,
  DataSource,
  Join,
  AliasValue,
  ColumnValue,
  Sort,
  WithStatement,
  SourceColumn,
  FunctionCall,
  WindowValue,
} from "./dba";

/**
 * Result of executing a DBA query
 */
export interface QueryResult {
  /** Rows returned (for SELECT) or affected (for INSERT/UPDATE/DELETE with RETURNING) */
  rows: Record<string, unknown>[];
  /** Number of rows affected (for INSERT/UPDATE/DELETE) */
  affectedCount?: number;
  /** Inserted record IDs (for INSERT) */
  insertedIds?: string[];
  /** Updated record IDs (for UPDATE) */
  updatedIds?: string[];
  /** Deleted record IDs (for DELETE) */
  deletedIds?: string[];
}

/**
 * Context for query execution containing resolved CTEs and source aliases
 */
interface QueryContext {
  /** Map of CTE names to their result sets */
  ctes: Map<string, DataRecord[]>;
  /** Map of aliases to their result sets */
  aliases: Map<string, DataRecord[]>;
  /** Configuration file for type definitions */
  config: ConfigFile;
  /** Data managers cache */
  dataManagers: Map<string, DataManager>;
}

/**
 * Load data manager for a table, using cache if available
 */
async function getDataManager(
  tableName: string,
  ctx: QueryContext
): Promise<DataManager> {
  let manager = ctx.dataManagers.get(tableName);
  if (!manager) {
    manager = new DataManager(tableName);
    await manager.load();
    ctx.dataManagers.set(tableName, manager);
  }
  return manager;
}

/**
 * Get type definition for a table
 */
function getTypeDefinition(
  tableName: string,
  ctx: QueryContext
): TypeDefinition | undefined {
  return ctx.config.getData().types.find((t) => t.name === tableName);
}

/**
 * Execute a complete DBA query
 */
export async function executeQuery(
  query: Query,
  config: ConfigFile
): Promise<QueryResult> {
  const ctx: QueryContext = {
    ctes: new Map(),
    aliases: new Map(),
    config,
    dataManagers: new Map(),
  };

  if ("kind" in query && query.kind === "withs") {
    return executeCTEStatement(query, ctx);
  }
  return executeStatement(query, ctx);
}

/**
 * Execute a CTE statement
 */
async function executeCTEStatement(
  stmt: CTEStatement,
  ctx: QueryContext
): Promise<QueryResult> {
  // Execute each CTE in order and store results
  for (const withStmt of stmt.withs) {
    await executeWithStatement(withStmt, ctx);
  }

  // Execute the final statement
  return executeStatement(stmt.final, ctx);
}

/**
 * Execute a WITH statement (CTE definition)
 */
async function executeWithStatement(
  withStmt: WithStatement,
  ctx: QueryContext
): Promise<void> {
  if (withStmt.kind === "cte") {
    const result = await executeStatement(withStmt.statement, ctx);
    // Convert rows to DataRecord format for CTE storage
    const records: DataRecord[] = result.rows.map((row, index) => ({
      id: `cte_${withStmt.name}_${index}`,
      created: Date.now(),
      updated: Date.now(),
      fields: row as Record<string, unknown>,
    }));
    ctx.ctes.set(withStmt.name, records);
  } else if (withStmt.kind === "cte-recursive") {
    // Execute initial statement
    const initialResult = await executeSelect(withStmt.statement, ctx);
    let allRecords: DataRecord[] = initialResult.rows.map((row, index) => ({
      id: `cte_${withStmt.name}_${index}`,
      created: Date.now(),
      updated: Date.now(),
      fields: row as Record<string, unknown>,
    }));

    // Store initial results for recursive reference
    ctx.ctes.set(withStmt.name, allRecords);

    // Execute recursive part until no new rows
    let iteration = 0;
    const maxIterations = 1000; // Safety limit
    let newRecords = allRecords;

    while (newRecords.length > 0 && iteration < maxIterations) {
      const recursiveResult = await executeSelect(
        withStmt.recursiveStatement,
        ctx
      );
      newRecords = recursiveResult.rows.map((row, index) => ({
        id: `cte_${withStmt.name}_recursive_${iteration}_${index}`,
        created: Date.now(),
        updated: Date.now(),
        fields: row as Record<string, unknown>,
      }));

      if (newRecords.length > 0) {
        allRecords = [...allRecords, ...newRecords];
        ctx.ctes.set(withStmt.name, allRecords);
      }
      iteration++;
    }
  }
}

/**
 * Execute a statement (SELECT, INSERT, UPDATE, DELETE, or SET operation)
 */
async function executeStatement(
  stmt: Statement,
  ctx: QueryContext
): Promise<QueryResult> {
  switch (stmt.kind) {
    case "select":
      return executeSelect(stmt, ctx);
    case "insert":
      return executeInsert(stmt, ctx);
    case "update":
      return executeUpdate(stmt, ctx);
    case "delete":
      return executeDelete(stmt, ctx);
    case "union":
    case "intersect":
    case "except":
      return executeSetOperation(stmt, ctx);
    default:
      throw new Error(`Unknown statement kind: ${(stmt as Statement).kind}`);
  }
}

/**
 * Execute a SELECT statement
 */
async function executeSelect(
  stmt: Select,
  ctx: QueryContext
): Promise<QueryResult> {
  // Get initial data source
  let records: DataRecord[] = [];

  if (stmt.from) {
    records = await resolveDataSource(stmt.from, ctx);
    if (stmt.from.kind === "table" && stmt.from.as) {
      ctx.aliases.set(stmt.from.as, records);
    } else if (stmt.from.kind === "subquery") {
      ctx.aliases.set(stmt.from.as, records);
    }
  }

  // Apply joins
  if (stmt.joins?.length) {
    for (const join of stmt.joins) {
      records = await applyJoin(records, join, ctx);
    }
  }

  // Apply WHERE clause
  if (stmt.where?.length) {
    records = records.filter((record) =>
      stmt.where!.every((cond) => evaluateBooleanValue(cond, record, ctx))
    );
  }

  // Apply GROUP BY and aggregations
  let rows: Record<string, unknown>[];

  if (stmt.groupBy?.length) {
    const groups = groupRecords(records, stmt.groupBy, ctx);
    rows = [];

    for (const [, groupRecords] of groups) {
      const row: Record<string, unknown> = {};
      for (const aliasValue of stmt.values) {
        row[aliasValue.alias] = evaluateValue(
          aliasValue.value,
          groupRecords[0],
          ctx,
          groupRecords
        );
      }
      rows.push(row);
    }

    // Apply HAVING clause
    if (stmt.having?.length) {
      rows = rows.filter((row) => {
        const tempRecord: DataRecord = {
          id: "",
          created: 0,
          updated: 0,
          fields: row as Record<string, unknown>,
        };
        return stmt.having!.every((cond) =>
          evaluateBooleanValue(cond, tempRecord, ctx)
        );
      });
    }
  } else {
    // No grouping - evaluate values for each record
    const hasAggregates = stmt.values.some((av) => containsAggregate(av.value));

    if (hasAggregates && records.length > 0) {
      // Single aggregate result
      const row: Record<string, unknown> = {};
      for (const aliasValue of stmt.values) {
        row[aliasValue.alias] = evaluateValue(
          aliasValue.value,
          records[0],
          ctx,
          records
        );
      }
      rows = [row];
    } else if (records.length === 0 && stmt.values.length > 0) {
      // No records but values requested - return empty or aggregate defaults
      if (hasAggregates) {
        const row: Record<string, unknown> = {};
        for (const aliasValue of stmt.values) {
          row[aliasValue.alias] = evaluateValue(
            aliasValue.value,
            null,
            ctx,
            []
          );
        }
        rows = [row];
      } else {
        rows = [];
      }
    } else {
      rows = records.map((record) => {
        const row: Record<string, unknown> = {};
        for (const aliasValue of stmt.values) {
          row[aliasValue.alias] = evaluateValue(aliasValue.value, record, ctx);
        }
        return row;
      });
    }
  }

  // Apply DISTINCT
  if (stmt.distinct) {
    const seen = new Set<string>();
    rows = rows.filter((row) => {
      const key = JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Apply ORDER BY
  if (stmt.orderBy?.length) {
    rows = sortRows(rows, stmt.orderBy, ctx);
  }

  // Apply OFFSET and LIMIT
  if (stmt.offset !== undefined && stmt.offset !== null) {
    rows = rows.slice(stmt.offset);
  }
  if (stmt.limit !== undefined && stmt.limit !== null) {
    rows = rows.slice(0, stmt.limit);
  }

  return { rows };
}

/**
 * Execute an INSERT statement
 */
async function executeInsert(
  stmt: Insert,
  ctx: QueryContext
): Promise<QueryResult> {
  const dataManager = await getDataManager(stmt.table, ctx);
  const insertedIds: string[] = [];
  const insertedRecords: DataRecord[] = [];

  // Get values to insert
  let valuesToInsert: Record<string, unknown>[];

  if (stmt.values?.length) {
    // Direct values
    const record: Record<string, unknown> = {};
    for (let i = 0; i < stmt.columns.length; i++) {
      record[stmt.columns[i]] = evaluateValue(stmt.values[i], null, ctx);
    }
    valuesToInsert = [record];
  } else if (stmt.select) {
    // Values from SELECT
    const selectResult = await executeStatement(stmt.select, ctx);
    valuesToInsert = selectResult.rows.map((row) => {
      const record: Record<string, unknown> = {};
      for (let i = 0; i < stmt.columns.length; i++) {
        const selectAlias = Object.keys(row)[i];
        record[stmt.columns[i]] = row[selectAlias];
      }
      return record;
    });
  } else {
    throw new Error("INSERT must have either values or select");
  }

  // Insert records
  for (const fields of valuesToInsert) {
    if (stmt.onConflict) {
      // Check for conflict
      const conflictKey = stmt.onConflict.columns
        .map((col) => String(fields[col]))
        .join("_");
      const existing = dataManager.getAll().find((record) => {
        const existingKey = stmt.onConflict!.columns
          .map((col) => String(record.fields[col]))
          .join("_");
        return existingKey === conflictKey;
      });

      if (existing) {
        if (stmt.onConflict.doNothing) {
          continue;
        } else if (stmt.onConflict.update?.length) {
          // Update on conflict
          const updates: Record<string, unknown> = {};
          for (const cv of stmt.onConflict.update) {
            updates[cv.column] = evaluateValue(cv.value, existing, ctx);
          }
          await dataManager.update(existing.id, updates);
          insertedIds.push(existing.id);
          insertedRecords.push({ ...existing, fields: { ...existing.fields, ...updates } });
          continue;
        }
      }
    }

    const id = await dataManager.create(fields as Record<string, unknown>);
    insertedIds.push(id);
    const record = dataManager.getById(id);
    if (record) {
      insertedRecords.push(record);
    }
  }

  // Handle RETURNING
  let rows: Record<string, unknown>[] = [];
  if (stmt.returning?.length) {
    rows = insertedRecords.map((record) => {
      const row: Record<string, unknown> = {};
      for (const av of stmt.returning!) {
        row[av.alias] = evaluateValue(av.value, record, ctx);
      }
      return row;
    });
  }

  return {
    rows,
    affectedCount: insertedIds.length,
    insertedIds,
  };
}

/**
 * Execute an UPDATE statement
 */
async function executeUpdate(
  stmt: Update,
  ctx: QueryContext
): Promise<QueryResult> {
  const dataManager = await getDataManager(stmt.table, ctx);
  let records = dataManager.getAll();

  // Set up alias if specified
  if (stmt.as) {
    ctx.aliases.set(stmt.as, records);
  }

  // Apply FROM clause
  if (stmt.from) {
    const fromRecords = await resolveDataSource(stmt.from, ctx);
    if (stmt.from.kind === "table" && stmt.from.as) {
      ctx.aliases.set(stmt.from.as, fromRecords);
    } else if (stmt.from.kind === "subquery") {
      ctx.aliases.set(stmt.from.as, fromRecords);
    }
  }

  // Apply joins
  if (stmt.joins?.length) {
    for (const join of stmt.joins) {
      records = await applyJoin(records, join, ctx);
    }
  }

  // Apply WHERE clause
  if (stmt.where?.length) {
    records = records.filter((record) =>
      stmt.where!.every((cond) => evaluateBooleanValue(cond, record, ctx))
    );
  }

  const updatedIds: string[] = [];
  const updatedRecords: DataRecord[] = [];

  // Update matching records
  for (const record of records) {
    const updates: Record<string, unknown> = {};
    for (const cv of stmt.set) {
      updates[cv.column] = evaluateValue(cv.value, record, ctx);
    }
    await dataManager.update(record.id, updates);
    updatedIds.push(record.id);

    const updated = dataManager.getById(record.id);
    if (updated) {
      updatedRecords.push(updated);
    }
  }

  // Handle RETURNING
  let rows: Record<string, unknown>[] = [];
  if (stmt.returning?.length) {
    rows = updatedRecords.map((record) => {
      const row: Record<string, unknown> = {};
      for (const av of stmt.returning!) {
        row[av.alias] = evaluateValue(av.value, record, ctx);
      }
      return row;
    });
  }

  return {
    rows,
    affectedCount: updatedIds.length,
    updatedIds,
  };
}

/**
 * Execute a DELETE statement
 */
async function executeDelete(
  stmt: Delete,
  ctx: QueryContext
): Promise<QueryResult> {
  const dataManager = await getDataManager(stmt.table, ctx);
  let records = dataManager.getAll();

  // Set up alias if specified
  if (stmt.as) {
    ctx.aliases.set(stmt.as, records);
  }

  // Apply joins
  if (stmt.joins?.length) {
    for (const join of stmt.joins) {
      records = await applyJoin(records, join, ctx);
    }
  }

  // Apply WHERE clause
  if (stmt.where?.length) {
    records = records.filter((record) =>
      stmt.where!.every((cond) => evaluateBooleanValue(cond, record, ctx))
    );
  }

  // Collect records for RETURNING before deletion
  const recordsToDelete = [...records];
  const deletedIds: string[] = [];

  // Handle RETURNING before deletion
  let rows: Record<string, unknown>[] = [];
  if (stmt.returning?.length) {
    rows = recordsToDelete.map((record) => {
      const row: Record<string, unknown> = {};
      for (const av of stmt.returning!) {
        row[av.alias] = evaluateValue(av.value, record, ctx);
      }
      return row;
    });
  }

  // Delete matching records
  for (const record of recordsToDelete) {
    await dataManager.delete(record.id);
    deletedIds.push(record.id);
  }

  return {
    rows,
    affectedCount: deletedIds.length,
    deletedIds,
  };
}

/**
 * Execute a set operation (UNION, INTERSECT, EXCEPT)
 */
async function executeSetOperation(
  stmt: SetOperation,
  ctx: QueryContext
): Promise<QueryResult> {
  const leftResult = await executeSelect(stmt.left, ctx);
  const rightResult = await executeSelect(stmt.right, ctx);

  let rows: Record<string, unknown>[];

  switch (stmt.kind) {
    case "union":
      rows = [...leftResult.rows, ...rightResult.rows];
      break;
    case "intersect":
      rows = leftResult.rows.filter((leftRow) =>
        rightResult.rows.some(
          (rightRow) => JSON.stringify(leftRow) === JSON.stringify(rightRow)
        )
      );
      break;
    case "except":
      rows = leftResult.rows.filter(
        (leftRow) =>
          !rightResult.rows.some(
            (rightRow) => JSON.stringify(leftRow) === JSON.stringify(rightRow)
          )
      );
      break;
    default:
      throw new Error(`Unknown set operation: ${stmt.kind}`);
  }

  // Remove duplicates unless ALL is specified
  if (!stmt.all) {
    const seen = new Set<string>();
    rows = rows.filter((row) => {
      const key = JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return { rows };
}

/**
 * Resolve a data source to records
 */
async function resolveDataSource(
  source: DataSource,
  ctx: QueryContext
): Promise<DataRecord[]> {
  if (source.kind === "table") {
    // Check if it's a CTE reference
    const cteRecords = ctx.ctes.get(source.table);
    if (cteRecords) {
      return cteRecords;
    }

    // Load from data manager
    const dataManager = await getDataManager(source.table, ctx);
    return dataManager.getAll();
  } else if (source.kind === "subquery") {
    const result = await executeStatement(source.subquery, ctx);
    return result.rows.map((row, index) => ({
      id: `subquery_${index}`,
      created: Date.now(),
      updated: Date.now(),
      fields: row as Record<string, unknown>,
    }));
  }

  throw new Error(`Unknown data source kind: ${(source as DataSource).kind}`);
}

/**
 * Apply a JOIN to records
 */
async function applyJoin(
  leftRecords: DataRecord[],
  join: Join,
  ctx: QueryContext
): Promise<DataRecord[]> {
  const rightRecords = await resolveDataSource(join.source, ctx);

  // Store right records in aliases if needed
  if (join.source.kind === "table" && join.source.as) {
    ctx.aliases.set(join.source.as, rightRecords);
  } else if (join.source.kind === "subquery") {
    ctx.aliases.set(join.source.as, rightRecords);
  }

  const result: DataRecord[] = [];

  switch (join.type) {
    case "inner":
      for (const left of leftRecords) {
        for (const right of rightRecords) {
          const combined = combineRecords(left, right);
          if (
            join.on.every((cond) => evaluateBooleanValue(cond, combined, ctx))
          ) {
            result.push(combined);
          }
        }
      }
      break;

    case "left":
      for (const left of leftRecords) {
        let matched = false;
        for (const right of rightRecords) {
          const combined = combineRecords(left, right);
          if (
            join.on.every((cond) => evaluateBooleanValue(cond, combined, ctx))
          ) {
            result.push(combined);
            matched = true;
          }
        }
        if (!matched) {
          result.push(left);
        }
      }
      break;

    case "right":
      for (const right of rightRecords) {
        let matched = false;
        for (const left of leftRecords) {
          const combined = combineRecords(left, right);
          if (
            join.on.every((cond) => evaluateBooleanValue(cond, combined, ctx))
          ) {
            result.push(combined);
            matched = true;
          }
        }
        if (!matched) {
          result.push(right);
        }
      }
      break;

    case "full":
      const rightMatched = new Set<string>();
      for (const left of leftRecords) {
        let matched = false;
        for (const right of rightRecords) {
          const combined = combineRecords(left, right);
          if (
            join.on.every((cond) => evaluateBooleanValue(cond, combined, ctx))
          ) {
            result.push(combined);
            matched = true;
            rightMatched.add(right.id);
          }
        }
        if (!matched) {
          result.push(left);
        }
      }
      // Add unmatched right records
      for (const right of rightRecords) {
        if (!rightMatched.has(right.id)) {
          result.push(right);
        }
      }
      break;
  }

  return result;
}

/**
 * Combine two records for join operations
 */
function combineRecords(left: DataRecord, right: DataRecord): DataRecord {
  return {
    id: `${left.id}_${right.id}`,
    created: Math.min(left.created, right.created),
    updated: Math.max(left.updated, right.updated),
    fields: { ...left.fields, ...right.fields },
  };
}

/**
 * Evaluate a value expression
 */
function evaluateValue(
  value: Value,
  record: DataRecord | null,
  ctx: QueryContext,
  groupRecords?: DataRecord[]
): unknown {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return value;
  }

  // Handle constants (primitives)
  if (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  // Handle source column reference
  if (isSourceColumn(value)) {
    if (!record) return null;
    // Check aliases first, then direct field access
    const aliasRecords = ctx.aliases.get(value.source);
    if (aliasRecords?.length) {
      // Find matching record by checking if record is in the alias set
      const aliasRecord = aliasRecords.find((r) => r.id === record.id);
      if (aliasRecord) {
        return aliasRecord.fields[value.column];
      }
    }
    return record.fields[value.column];
  }

  // Handle complex value types
  if (typeof value === "object" && "kind" in value) {
    switch (value.kind) {
      case "select": {
        // Subquery - should return single value
        // This is synchronous evaluation, so we need to handle this carefully
        // For now, return null as subqueries in values are complex
        return null;
      }

      case "binary": {
        const left = evaluateValue(value.left, record, ctx, groupRecords);
        const right = evaluateValue(value.right, record, ctx, groupRecords);
        return evaluateBinaryOp(left, value.op, right);
      }

      case "unary": {
        const operand = evaluateValue(value.value, record, ctx, groupRecords);
        if (value.unary === "-" && typeof operand === "number") {
          return -operand;
        }
        return operand;
      }

      case "aggregate": {
        const records = groupRecords || (record ? [record] : []);
        return evaluateAggregate(
          value.aggregate,
          value.value,
          records,
          ctx
        );
      }

      case "function": {
        return evaluateFunction(value, record, ctx, groupRecords);
      }

      case "window": {
        return evaluateWindow(value, record, ctx, groupRecords);
      }

      case "case": {
        for (const branch of value.case) {
          if (record && evaluateBooleanValue(branch.when, record, ctx)) {
            return evaluateValue(branch.then, record, ctx, groupRecords);
          }
        }
        return value.else !== undefined && value.else !== null
          ? evaluateValue(value.else, record, ctx, groupRecords)
          : null;
      }

      case "semanticSimilarity": {
        // Semantic similarity requires embedding - return 0 for now
        return 0;
      }

      // Boolean value types
      case "comparison":
      case "in":
      case "between":
      case "isNull":
      case "exists":
      case "and":
      case "or":
      case "not":
        return record
          ? evaluateBooleanValue(value as BooleanValue, record, ctx)
          : false;
    }
  }

  return null;
}

/**
 * Check if a value is a SourceColumn
 */
function isSourceColumn(value: Value): value is SourceColumn {
  return (
    typeof value === "object" &&
    value !== null &&
    "source" in value &&
    "column" in value &&
    !("kind" in value)
  );
}

/**
 * Evaluate a binary operation
 */
function evaluateBinaryOp(
  left: unknown,
  op: string,
  right: unknown
): unknown {
  const l = typeof left === "number" ? left : Number(left);
  const r = typeof right === "number" ? right : Number(right);

  if (isNaN(l) || isNaN(r)) {
    // String concatenation for +
    if (op === "+") {
      return String(left ?? "") + String(right ?? "");
    }
    return null;
  }

  switch (op) {
    case "+":
      return l + r;
    case "-":
      return l - r;
    case "*":
      return l * r;
    case "/":
      return r !== 0 ? l / r : null;
    default:
      return null;
  }
}

/**
 * Evaluate an aggregate function
 */
function evaluateAggregate(
  aggregate: string,
  valueExpr: Value | "*",
  records: DataRecord[],
  ctx: QueryContext
): unknown {
  if (valueExpr === "*") {
    if (aggregate === "count") {
      return records.length;
    }
    return null;
  }

  const values = records
    .map((r) => evaluateValue(valueExpr, r, ctx))
    .filter((v) => v !== null && v !== undefined);

  switch (aggregate) {
    case "count":
      return values.length;
    case "sum": {
      const nums = values.map(Number).filter((n) => !isNaN(n));
      return nums.reduce((a, b) => a + b, 0);
    }
    case "avg": {
      const nums = values.map(Number).filter((n) => !isNaN(n));
      return nums.length > 0
        ? nums.reduce((a, b) => a + b, 0) / nums.length
        : null;
    }
    case "min": {
      if (values.length === 0) return null;
      return values.reduce((min, v) => (v < min ? v : min));
    }
    case "max": {
      if (values.length === 0) return null;
      return values.reduce((max, v) => (v > max ? v : max));
    }
    default:
      return null;
  }
}

/**
 * Evaluate a function call
 */
function evaluateFunction(
  func: FunctionCall,
  record: DataRecord | null,
  ctx: QueryContext,
  groupRecords?: DataRecord[]
): unknown {
  const args = func.args.map((arg) =>
    evaluateValue(arg, record, ctx, groupRecords)
  );

  switch (func.function) {
    // String functions
    case "concat":
      return args.map((a) => String(a ?? "")).join("");
    case "substring": {
      const str = String(args[0] ?? "");
      const start = Number(args[1] ?? 0);
      const length = args[2] !== undefined ? Number(args[2]) : undefined;
      return length !== undefined
        ? str.substring(start, start + length)
        : str.substring(start);
    }
    case "length":
      return String(args[0] ?? "").length;
    case "lower":
      return String(args[0] ?? "").toLowerCase();
    case "upper":
      return String(args[0] ?? "").toUpperCase();
    case "trim":
      return String(args[0] ?? "").trim();
    case "replace": {
      const str = String(args[0] ?? "");
      const search = String(args[1] ?? "");
      const replacement = String(args[2] ?? "");
      return str.replace(new RegExp(search, "g"), replacement);
    }

    // Number functions
    case "abs":
      return Math.abs(Number(args[0]));
    case "ceil":
      return Math.ceil(Number(args[0]));
    case "floor":
      return Math.floor(Number(args[0]));
    case "round":
      return Math.round(Number(args[0]));
    case "power":
      return Math.pow(Number(args[0]), Number(args[1]));
    case "sqrt":
      return Math.sqrt(Number(args[0]));

    // Date functions
    case "now":
      return new Date().toISOString();
    case "current_date":
      return new Date().toISOString().split("T")[0];
    case "date_add":
    case "date_sub": {
      const date = new Date(String(args[0]));
      const interval = Number(args[1]);
      const unit = String(args[2] ?? "days");
      const multiplier = func.function === "date_sub" ? -1 : 1;

      switch (unit.toLowerCase()) {
        case "years":
          date.setFullYear(date.getFullYear() + interval * multiplier);
          break;
        case "months":
          date.setMonth(date.getMonth() + interval * multiplier);
          break;
        case "days":
          date.setDate(date.getDate() + interval * multiplier);
          break;
        case "hours":
          date.setHours(date.getHours() + interval * multiplier);
          break;
        case "minutes":
          date.setMinutes(date.getMinutes() + interval * multiplier);
          break;
        case "seconds":
          date.setSeconds(date.getSeconds() + interval * multiplier);
          break;
      }
      return date.toISOString();
    }
    case "extract": {
      const part = String(args[0]).toLowerCase();
      const date = new Date(String(args[1]));
      switch (part) {
        case "year":
          return date.getFullYear();
        case "month":
          return date.getMonth() + 1;
        case "day":
          return date.getDate();
        case "hour":
          return date.getHours();
        case "minute":
          return date.getMinutes();
        case "second":
          return date.getSeconds();
        default:
          return null;
      }
    }
    case "date_trunc": {
      const part = String(args[0]).toLowerCase();
      const date = new Date(String(args[1]));
      switch (part) {
        case "year":
          return new Date(date.getFullYear(), 0, 1).toISOString();
        case "month":
          return new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
        case "day":
          return new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
          ).toISOString();
        default:
          return date.toISOString();
      }
    }

    // Logic functions
    case "coalesce":
      return args.find((a) => a !== null && a !== undefined) ?? null;
    case "nullif":
      return args[0] === args[1] ? null : args[0];
    case "greatest": {
      const nums = args.map(Number).filter((n) => !isNaN(n));
      return nums.length > 0 ? Math.max(...nums) : null;
    }
    case "least": {
      const nums = args.map(Number).filter((n) => !isNaN(n));
      return nums.length > 0 ? Math.min(...nums) : null;
    }

    default:
      return null;
  }
}

/**
 * Evaluate a window function
 */
function evaluateWindow(
  window: WindowValue,
  record: DataRecord | null,
  ctx: QueryContext,
  groupRecords?: DataRecord[]
): unknown {
  // Window functions need access to the full partition
  // For simplicity, use groupRecords if available
  const records = groupRecords || (record ? [record] : []);

  // Apply partition if specified
  let partitionedRecords = records;
  if (window.partitionBy?.length && record) {
    const partitionKey = window.partitionBy
      .map((v) => JSON.stringify(evaluateValue(v, record, ctx)))
      .join("_");

    partitionedRecords = records.filter((r) => {
      const key = window.partitionBy!
        .map((v) => JSON.stringify(evaluateValue(v, r, ctx)))
        .join("_");
      return key === partitionKey;
    });
  }

  // Apply ordering if specified
  if (window.orderBy?.length) {
    partitionedRecords = [...partitionedRecords];
    partitionedRecords.sort((a, b) => {
      for (const sort of window.orderBy!) {
        const aVal = evaluateValue(sort.value, a, ctx);
        const bVal = evaluateValue(sort.value, b, ctx);
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        if (cmp !== 0) {
          return sort.dir === "desc" ? -cmp : cmp;
        }
      }
      return 0;
    });
  }

  // Evaluate the window function
  return evaluateAggregate(
    window.function,
    window.value,
    partitionedRecords,
    ctx
  );
}

/**
 * Evaluate a boolean value expression
 */
function evaluateBooleanValue(
  value: BooleanValue,
  record: DataRecord,
  ctx: QueryContext
): boolean {
  switch (value.kind) {
    case "comparison": {
      const left = evaluateValue(value.left, record, ctx);
      const right = evaluateValue(value.right, record, ctx);
      return evaluateComparison(left, value.cmp, right);
    }

    case "in": {
      const val = evaluateValue(value.value, record, ctx);
      if (Array.isArray(value.in)) {
        return value.in.some((v) => evaluateValue(v, record, ctx) === val);
      }
      // Subquery - would need async handling
      return false;
    }

    case "between": {
      const val = evaluateValue(value.value, record, ctx);
      const low = evaluateValue(value.between[0], record, ctx);
      const high = evaluateValue(value.between[1], record, ctx);
      return val >= low && val <= high;
    }

    case "isNull": {
      const val = evaluateValue(value.isNull, record, ctx);
      return val === null || val === undefined;
    }

    case "exists": {
      // Subquery - would need async handling
      return false;
    }

    case "and":
      return value.and.every((v) => evaluateBooleanValue(v, record, ctx));

    case "or":
      return value.or.some((v) => evaluateBooleanValue(v, record, ctx));

    case "not":
      return !evaluateBooleanValue(value.not, record, ctx);

    default:
      return false;
  }
}

/**
 * Evaluate a comparison operation
 */
function evaluateComparison(
  left: unknown,
  cmp: string,
  right: unknown
): boolean {
  switch (cmp) {
    case "=":
      return left === right;
    case "<>":
      return left !== right;
    case "<":
      return left < right;
    case ">":
      return left > right;
    case "<=":
      return left <= right;
    case ">=":
      return left >= right;
    case "like": {
      const pattern = String(right ?? "")
        .replace(/%/g, ".*")
        .replace(/_/g, ".");
      return new RegExp(`^${pattern}$`, "i").test(String(left ?? ""));
    }
    case "notLike": {
      const pattern = String(right ?? "")
        .replace(/%/g, ".*")
        .replace(/_/g, ".");
      return !new RegExp(`^${pattern}$`, "i").test(String(left ?? ""));
    }
    default:
      return false;
  }
}

/**
 * Group records by specified values
 */
function groupRecords(
  records: DataRecord[],
  groupBy: Value[],
  ctx: QueryContext
): Map<string, DataRecord[]> {
  const groups = new Map<string, DataRecord[]>();

  for (const record of records) {
    const key = groupBy
      .map((v) => JSON.stringify(evaluateValue(v, record, ctx)))
      .join("_");

    const group = groups.get(key) || [];
    group.push(record);
    groups.set(key, group);
  }

  return groups;
}

/**
 * Sort rows by specified criteria
 */
function sortRows(
  rows: Record<string, unknown>[],
  orderBy: Sort[],
  ctx: QueryContext
): Record<string, unknown>[] {
  return [...rows].sort((a, b) => {
    for (const sort of orderBy) {
      const tempRecordA: DataRecord = {
        id: "",
        created: 0,
        updated: 0,
        fields: a as Record<string, unknown>,
      };
      const tempRecordB: DataRecord = {
        id: "",
        created: 0,
        updated: 0,
        fields: b as Record<string, unknown>,
      };

      const aVal = evaluateValue(sort.value, tempRecordA, ctx);
      const bVal = evaluateValue(sort.value, tempRecordB, ctx);

      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      if (cmp !== 0) {
        return sort.dir === "desc" ? -cmp : cmp;
      }
    }
    return 0;
  });
}

/**
 * Check if a value expression contains an aggregate function
 */
function containsAggregate(value: Value): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object") return false;

  if ("kind" in value) {
    if (value.kind === "aggregate") return true;
    if (value.kind === "binary") {
      return containsAggregate(value.left) || containsAggregate(value.right);
    }
    if (value.kind === "unary") {
      return containsAggregate(value.value);
    }
    if (value.kind === "function") {
      return value.args.some(containsAggregate);
    }
    if (value.kind === "case") {
      return (
        value.case.some(
          (c) => containsAggregate(c.then)
        ) ||
        (value.else !== undefined &&
          value.else !== null &&
          containsAggregate(value.else))
      );
    }
  }

  return false;
}
