import { v4 as uuidv4 } from 'uuid';
import { DataManager } from "../data";
import { ConfigFile } from "../config";
import { DataRecord, DataFile, TypeDefinition } from "../schemas";
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
  Sort,
  WithStatement,
  SourceColumn,
  FunctionCall,
  WindowValue,
  SelectOrSet,
} from "./dba";

/**
 * Interface for data management operations
 */
export interface IDataManager {
  /** Load data from storage */
  load(): Promise<void>;
  /** Save data with optional transformation */
  save(fn: (dataFile: DataFile) => void | Promise<void>): Promise<void>;
  /** Get all records */
  getAll(): DataRecord[];
}

/**
 * Result of executing a DBA query
 */
export interface QueryResult {
  /** Rows returned (for SELECT) or affected (for INSERT/UPDATE/DELETE with RETURNING) */
  rows: Record<string, unknown>[];
  /** Number of rows affected (for INSERT/UPDATE/DELETE) */
  affectedCount?: number;
  /** Inserted record IDs (for INSERT) */
  inserted?: QueryResultType[];
  /** Updated record IDs (for UPDATE) */
  updated?: QueryResultType[];
  /** Deleted record IDs (for DELETE) */
  deleted?: QueryResultType[];
}

/**
 * Type for inserted/updated/deleted IDs result
 */
export interface QueryResultType {
  /** The type */
  type: string;
  /** The ids of the type affected  */
  ids: string[];
}


/**
 * Transactional state for a table - tracks original data and pending changes
 */
interface TableState {
  /** Original records loaded from disk */
  original: DataRecord[];
  /** Current records including pending changes */
  current: DataRecord[];
  /** Set of IDs that have been deleted */
  deletedIds: Set<string>;
  /** Map of IDs to their updated fields */
  updatedIds: Map<string, Record<string, unknown>>;
  /** Map of IDs to their insert fields (for new records) */
  insertedIds: Map<string, Record<string, unknown>>;
}

/**
 * Context for query execution containing transactional state
 */
interface QueryContext {
  /** Map of CTE names to their result sets */
  ctes: Map<string, DataRecord[]>;
  /** Map of aliases to their result sets */
  aliases: Map<string, DataRecord[]>;
  /** Function to get type definitions */
  getTypes: () => TypeDefinition[];
  /** Function to get data manager for a type */
  getManager: (typeName: string) => IDataManager;
  /** Type definitions cache */
  types: Map<string, TypeDefinition>;
  /** Transactional table state */
  tableStates: Map<string, TableState>;
  /** Data managers for committing */
  dataManagers: Map<string, IDataManager>;
}

/**
 * Collect all table names referenced in a query for upfront loading
 */
function collectReferencedTables(query: Query, tables: Set<string>): void {
  if (!query || typeof query !== 'object') return;
  
  if ('kind' in query) {
    switch (query.kind) {
      case 'select':
        if (query.from?.kind === 'table') {
          tables.add(query.from.table);
        } else if (query.from?.kind === 'subquery') {
          collectReferencedTablesFromSelectOrSet(query.from.subquery, tables);
        }
        if (query.joins) {
          for (const join of query.joins) {
            if (join.source.kind === 'table') {
              tables.add(join.source.table);
            } else if (join.source.kind === 'subquery') {
              collectReferencedTablesFromSelectOrSet(join.source.subquery, tables);
            }
          }
        }
        break;
        
      case 'insert':
        tables.add(query.table);
        if (query.select) {
          collectReferencedTablesFromSelectOrSet(query.select, tables);
        }
        break;
        
      case 'update':
        tables.add(query.table);
        if (query.from?.kind === 'table') {
          tables.add(query.from.table);
        } else if (query.from?.kind === 'subquery') {
          collectReferencedTablesFromSelectOrSet(query.from.subquery, tables);
        }
        if (query.joins) {
          for (const join of query.joins) {
            if (join.source.kind === 'table') {
              tables.add(join.source.table);
            } else if (join.source.kind === 'subquery') {
              collectReferencedTablesFromSelectOrSet(join.source.subquery, tables);
            }
          }
        }
        break;
        
      case 'delete':
        tables.add(query.table);
        if (query.joins) {
          for (const join of query.joins) {
            if (join.source.kind === 'table') {
              tables.add(join.source.table);
            } else if (join.source.kind === 'subquery') {
              collectReferencedTablesFromSelectOrSet(join.source.subquery, tables);
            }
          }
        }
        break;
        
      case 'union':
      case 'intersect':
      case 'except':
        collectReferencedTables(query.left, tables);
        collectReferencedTables(query.right, tables);
        break;
        
      case 'withs':
        for (const withStmt of query.withs) {
          if (withStmt.kind === 'cte') {
            collectReferencedTables(withStmt.statement, tables);
          } else if (withStmt.kind === 'cte-recursive') {
            collectReferencedTables(withStmt.statement, tables);
            collectReferencedTables(withStmt.recursiveStatement, tables);
          }
        }
        collectReferencedTables(query.final, tables);
        break;
    }
  }
}

function collectReferencedTablesFromSelectOrSet(query: SelectOrSet, tables: Set<string>): void {
  collectReferencedTables(query, tables);
}

/**
 * Load table state, initializing if needed
 */
async function getTableState(tableName: string, ctx: QueryContext): Promise<TableState> {
  let state = ctx.tableStates.get(tableName);
  if (!state) {
    let manager = ctx.dataManagers.get(tableName);
    if (!manager) {
      manager = ctx.getManager(tableName);
      await manager.load();
      ctx.dataManagers.set(tableName, manager);
    }

    const original = manager.getAll();
    state = {
      original,
      current: [...original],
      deletedIds: new Set(),
      updatedIds: new Map(),
      insertedIds: new Map(),
    };
    ctx.tableStates.set(tableName, state);
  }
  return state;
}

/**
 * Get current records from table state (includes pending changes)
 */
function getRecords(state: TableState): DataRecord[] {
  return state.current;
}

/**
 * Add insert operation to table state
 */
function addInsert(state: TableState, id: string, fields: Record<string, unknown>): DataRecord {
  const now = Date.now();
  const record: DataRecord = {
    id,
    created: now,
    updated: now,
    fields,
  };
  
  // If this ID was previously deleted, remove the delete
  if (state.deletedIds.has(id)) {
    state.deletedIds.delete(id);
  }
  
  state.current.push(record);
  state.insertedIds.set(id, fields);
  
  return record;
}

/**
 * Add update operation to table state
 */
function addUpdate(state: TableState, id: string, fields: Record<string, unknown>): void {
  // Find the record in current state
  const record = state.current.find(r => r.id === id);
  if (!record) return;
  
  // Apply update to current state
  Object.assign(record.fields, fields);
  record.updated = Date.now();
  
  // If this was a new insert, just update the insert's fields in the map
  if (state.insertedIds.has(id)) {
    const existingFields = state.insertedIds.get(id);
    if (existingFields) {
      Object.assign(existingFields, fields);
    }
  } else {
    // Merge with existing updates or add new update
    const existing = state.updatedIds.get(id);
    if (existing) {
      Object.assign(existing, fields);
    } else {
      state.updatedIds.set(id, { ...fields });
    }
  }
}

/**
 * Add delete operation to table state
 */
function addDelete(state: TableState, id: string): void {
  // Remove from current state
  state.current = state.current.filter(r => r.id !== id);
  
  // If this was a new insert, just remove the insert
  if (state.insertedIds.has(id)) {
    state.insertedIds.delete(id);
  } else {
    // Remove any pending updates for this record
    state.updatedIds.delete(id);
    
    // Add delete operation
    state.deletedIds.add(id);
  }
}

/**
 * Commit all pending changes to disk
 */
async function commitChanges(ctx: QueryContext): Promise<{
  inserted: QueryResultType[];
  updated: QueryResultType[];
  deleted: QueryResultType[];
}> {
  const result = {
    inserted: [] as QueryResultType[],
    updated: [] as QueryResultType[],
    deleted: [] as QueryResultType[],
  };

  const now = Date.now();
  
  for (const [tableName, state] of ctx.tableStates) {
    const manager = ctx.dataManagers.get(tableName);
    if (!manager) {
      continue;
    }

    await manager.save(async (dataFile) => {
      // Inserts
      const inserts: QueryResultType = { type: tableName, ids: [] };
      for (const [tempId, fields] of state.insertedIds) {
        const newRecord: DataRecord = {
          id: uuidv4(),
          updated: now,
          created: now,
          fields,
        };
        dataFile.data.push(newRecord);
        inserts.ids.push(newRecord.id);
      }
      if (inserts.ids.length > 0) {
        result.inserted.push(inserts);
      }

      // Update
      const updates: QueryResultType = { type: tableName, ids: [] };
      for (const [id, fields] of state.updatedIds) {
        if (!state.insertedIds.has(id)) {
          const item = dataFile.data.find((item) => item.id === id);
          if (!item) {
            throw new Error(`Item with ID ${id} not found in ${tableName}`);
          }
          Object.assign(item.fields, fields);
          item.updated = now;
          updates.ids.push(id);
        }
      }
      if (updates.ids.length > 0) {
        result.updated.push(updates);
      }

      // Deletes
      const deletes: QueryResultType = { type: tableName, ids: [] };
      for (const id of state.deletedIds) {
        if (!state.insertedIds.has(id)) {
          const index = dataFile.data.findIndex((item) => item.id === id);
          if (index === -1) {
            throw new Error(`Item with ID ${id} not found in ${tableName}`);
          }
          dataFile.data.splice(index, 1);
          deletes.ids.push(id);
        }
      }
      if (deletes.ids.length > 0) {
        result.deleted.push(deletes);
      }
    });
  }
  
  return result;
}

/**
 * Execute a complete DBA query
 */
export async function executeQuery(
  query: Query,
  getTypes: () => TypeDefinition[],
  getManager: (typeName: string) => IDataManager
): Promise<QueryResult> {
  // Collect all referenced tables upfront
  const referencedTables = new Set<string>();
  collectReferencedTables(query, referencedTables);

  // Build type definitions cache
  const types = new Map<string, TypeDefinition>();
  for (const type of getTypes()) {
    types.set(type.name, type);
  }

  const ctx: QueryContext = {
    ctes: new Map(),
    aliases: new Map(),
    getTypes,
    getManager,
    types,
    tableStates: new Map(),
    dataManagers: new Map(),
  };

  // Pre-load all referenced tables
  for (const tableName of referencedTables) {
    // Only load tables that exist as types (skip CTE names)
    if (types.has(tableName)) {
      await getTableState(tableName, ctx);
    }
  }

  let result: QueryResult;
  if ("kind" in query && query.kind === "withs") {
    result = await executeCTEStatement(query, ctx);
  } else {
    result = await executeStatement(query, ctx);
  }
  
  // Commit all changes at the end
  const { inserted, updated, deleted } = await commitChanges(ctx);
  
  // Replace query-time IDs with commit-time IDs (commit has the real UUIDs)
  // For inserts, the temp IDs from execution are replaced with real UUIDs from commit
  // For updates/deletes, the IDs are the same so we deduplicate
  const insertedMap = new Map<string, QueryResultType>();
  const updatedMap = new Map(result.updated?.map(u => [u.type, u]));
  const deletedMap = new Map(result.deleted?.map(d => [d.type, d]));

  // For inserts, use ONLY the committed IDs (not the temporary query-time IDs)
  for (const ins of inserted) {
    insertedMap.set(ins.type, ins);
  }

  // For updates, deduplicate by merging
  for (const upd of updated) {
    const existing = updatedMap.get(upd.type);
    if (existing) {
      existing.ids = Array.from(new Set([...existing.ids, ...upd.ids]));
    } else {
      updatedMap.set(upd.type, upd);
    }
  }

  // For deletes, deduplicate by merging
  for (const del of deleted) {
    const existing = deletedMap.get(del.type);
    if (existing) {
      existing.ids = Array.from(new Set([...existing.ids, ...del.ids]));
    } else {
      deletedMap.set(del.type, del);
    }
  }

  const insertedArray = Array.from(insertedMap.values());
  const updatedArray = Array.from(updatedMap.values());
  const deletedArray = Array.from(deletedMap.values());

  result.inserted = insertedArray.length > 0 ? insertedArray : undefined;
  result.updated = updatedArray.length > 0 ? updatedArray : undefined;
  result.deleted = deletedArray.length > 0 ? deletedArray : undefined;

  return result;
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
        fields: row,
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
    records = await filterRecordsAsync(records, stmt.where, ctx);
  }

  // Apply GROUP BY and aggregations
  let rows: Record<string, unknown>[];

  if (stmt.groupBy?.length) {
    const groups = groupRecords(records, stmt.groupBy, ctx);
    const rowsWithGroups: Array<{ row: Record<string, unknown>; groupRecs: DataRecord[] }> = [];

    for (const [, groupRecs] of groups) {
      const row: Record<string, unknown> = {};
      for (const aliasValue of stmt.values) {
        row[aliasValue.alias] = await evaluateValueAsync(
          aliasValue.value,
          groupRecs[0],
          ctx,
          groupRecs
        );
      }
      rowsWithGroups.push({ row, groupRecs });
    }

    // Apply HAVING clause - needs access to group records for aggregate evaluation
    if (stmt.having?.length) {
      const filteredRowsWithGroups: Array<{ row: Record<string, unknown>; groupRecs: DataRecord[] }> = [];
      for (const { row, groupRecs } of rowsWithGroups) {
        // Evaluate HAVING with access to the group records for aggregates
        let matches = true;
        for (const cond of stmt.having) {
          if (!(await evaluateSingleBooleanWithGroupAsync(cond, groupRecs[0], ctx, groupRecs))) {
            matches = false;
            break;
          }
        }
        if (matches) {
          filteredRowsWithGroups.push({ row, groupRecs });
        }
      }
      rows = filteredRowsWithGroups.map(({ row }) => row);
    } else {
      rows = rowsWithGroups.map(({ row }) => row);
    }
  } else {
    // No grouping - evaluate values for each record
    const hasAggregates = stmt.values.some((av) => containsAggregate(av.value));

    if (hasAggregates && records.length > 0) {
      // Single aggregate result
      const row: Record<string, unknown> = {};
      for (const aliasValue of stmt.values) {
        row[aliasValue.alias] = await evaluateValueAsync(
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
          row[aliasValue.alias] = await evaluateValueAsync(
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
      rows = [];
      for (const record of records) {
        const row: Record<string, unknown> = {};
        for (const aliasValue of stmt.values) {
          // Pass all records for window function support
          row[aliasValue.alias] = await evaluateValueAsync(aliasValue.value, record, ctx, records);
        }
        rows.push(row);
      }
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
    rows = await sortRowsAsync(rows, stmt.orderBy, ctx);
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
  const state = await getTableState(stmt.table, ctx);
  const insertResult: QueryResultType = { type: stmt.table, ids: [] };
  const insertedRecords: DataRecord[] = [];

  // Get values to insert
  let valuesToInsert: Record<string, unknown>[];

  if (stmt.values?.length) {
    // Direct values
    const record: Record<string, unknown> = {};
    for (let i = 0; i < stmt.columns.length; i++) {
      record[stmt.columns[i]] = await evaluateValueAsync(stmt.values[i], null, ctx);
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
      // Check for conflict using JSON.stringify for key
      const conflictKey = JSON.stringify(
        stmt.onConflict.columns.map((col) => fields[col])
      );
      const existing = getRecords(state).find((record) => {
        const existingKey = JSON.stringify(
          stmt.onConflict!.columns.map((col) => record.fields[col])
        );
        return existingKey === conflictKey;
      });

      if (existing) {
        if (stmt.onConflict.doNothing) {
          continue;
        } else if (stmt.onConflict.update?.length) {
          // Update on conflict
          const updates: Record<string, unknown> = {};
          for (const cv of stmt.onConflict.update) {
            updates[cv.column] = await evaluateValueAsync(cv.value, existing, ctx);
          }
          addUpdate(state, existing.id, updates);
          insertResult.ids.push(existing.id);
          insertedRecords.push({ ...existing, fields: { ...existing.fields, ...updates } });
          continue;
        }
      }
    }

    const id = uuidv4();
    const record = addInsert(state, id, fields);
    insertResult.ids.push(id);
    insertedRecords.push(record);
  }

  // Handle RETURNING
  let rows: Record<string, unknown>[] = [];
  if (stmt.returning?.length) {
    for (const record of insertedRecords) {
      const row: Record<string, unknown> = {};
      for (const av of stmt.returning) {
        row[av.alias] = await evaluateValueAsync(av.value, record, ctx);
      }
      rows.push(row);
    }
  }

  return {
    rows,
    affectedCount: insertResult.ids.length,
    inserted: insertResult.ids.length ? [insertResult] : undefined,
  };
}

/**
 * Execute an UPDATE statement
 */
async function executeUpdate(
  stmt: Update,
  ctx: QueryContext
): Promise<QueryResult> {
  const state = await getTableState(stmt.table, ctx);
  let records = getRecords(state);

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
    records = await filterRecordsAsync(records, stmt.where, ctx);
  }

  const updateResult: QueryResultType = { type: stmt.table, ids: [] };
  const updatedRecords: DataRecord[] = [];

  // Update matching records
  for (const record of records) {
    const updates: Record<string, unknown> = {};
    for (const cv of stmt.set) {
      updates[cv.column] = await evaluateValueAsync(cv.value, record, ctx);
    }
    addUpdate(state, record.id, updates);
    updateResult.ids.push(record.id);

    // Get updated record from current state
    const updated = getRecords(state).find(r => r.id === record.id);
    if (updated) {
      updatedRecords.push(updated);
    }
  }

  // Handle RETURNING
  let rows: Record<string, unknown>[] = [];
  if (stmt.returning?.length) {
    for (const record of updatedRecords) {
      const row: Record<string, unknown> = {};
      for (const av of stmt.returning) {
        row[av.alias] = await evaluateValueAsync(av.value, record, ctx);
      }
      rows.push(row);
    }
  }

  return {
    rows,
    affectedCount: updateResult.ids.length,
    updated: updateResult.ids.length ? [updateResult] : undefined,
  };
}

/**
 * Execute a DELETE statement
 */
async function executeDelete(
  stmt: Delete,
  ctx: QueryContext
): Promise<QueryResult> {
  const state = await getTableState(stmt.table, ctx);
  let records = getRecords(state);

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
    records = await filterRecordsAsync(records, stmt.where, ctx);
  }

  // Collect records for RETURNING before deletion
  const recordsToDelete = [...records];
  const deleteResult: QueryResultType = { type: stmt.table, ids: [] };

  // Handle RETURNING before deletion
  let rows: Record<string, unknown>[] = [];
  if (stmt.returning?.length) {
    for (const record of recordsToDelete) {
      const row: Record<string, unknown> = {};
      for (const av of stmt.returning) {
        row[av.alias] = await evaluateValueAsync(av.value, record, ctx);
      }
      rows.push(row);
    }
  }

  // Delete matching records
  for (const record of recordsToDelete) {
    addDelete(state, record.id);
    deleteResult.ids.push(record.id);
  }

  return {
    rows,
    affectedCount: deleteResult.ids.length,
    deleted: deleteResult.ids.length ? [deleteResult] : undefined,
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

    // Load from table state
    const state = await getTableState(source.table, ctx);
    return getRecords(state);
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
          if (await evaluateBooleanValueAsync(join.on, combined, ctx)) {
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
          if (await evaluateBooleanValueAsync(join.on, combined, ctx)) {
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
          if (await evaluateBooleanValueAsync(join.on, combined, ctx)) {
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
          if (await evaluateBooleanValueAsync(join.on, combined, ctx)) {
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
 * Stores references to original records so aliased columns can be resolved
 */
function combineRecords(left: DataRecord, right: DataRecord): DataRecord {
  return {
    id: `${left.id}_${right.id}`,
    created: Math.min(left.created, right.created),
    updated: Math.max(left.updated, right.updated),
    fields: { ...left.fields, ...right.fields },
    // Store original records as metadata (using special keys that won't conflict with user fields)
    __left__: left,
    __right__: right,
  } as DataRecord;
}

/**
 * Filter records by WHERE conditions (async for subquery support)
 */
async function filterRecordsAsync(
  records: DataRecord[],
  conditions: BooleanValue[],
  ctx: QueryContext
): Promise<DataRecord[]> {
  const result: DataRecord[] = [];
  for (const record of records) {
    if (await evaluateBooleanValueAsync(conditions, record, ctx)) {
      result.push(record);
    }
  }
  return result;
}

/**
 * Evaluate an array of boolean conditions (ANDed together) - async version
 */
async function evaluateBooleanValueAsync(
  conditions: BooleanValue[],
  record: DataRecord,
  ctx: QueryContext
): Promise<boolean> {
  for (const cond of conditions) {
    if (!(await evaluateSingleBooleanAsync(cond, record, ctx))) {
      return false;
    }
  }
  return true;
}

/**
 * Evaluate a single boolean value expression - async version
 */
async function evaluateSingleBooleanAsync(
  value: BooleanValue,
  record: DataRecord,
  ctx: QueryContext
): Promise<boolean> {
  switch (value.kind) {
    case "comparison": {
      const left = await evaluateValueAsync(value.left, record, ctx);
      const right = await evaluateValueAsync(value.right, record, ctx);
      return evaluateComparison(left, value.cmp, right);
    }

    case "in": {
      const val = await evaluateValueAsync(value.value, record, ctx);
      if (Array.isArray(value.in)) {
        for (const v of value.in) {
          if (compare((await evaluateValueAsync(v, record, ctx)), val) === 0) {
            return true;
          }
        }
        return false;
      }
      // Subquery IN - execute the subquery
      const subResult = await executeStatement(value.in, ctx);
      const subValues = subResult.rows.map(r => Object.values(r)[0]);
      return subValues.some(x => compare(val, x) === 0);
    }

    case "between": {
      const val = await evaluateValueAsync(value.value, record, ctx);
      const low = await evaluateValueAsync(value.between[0], record, ctx);
      const high = await evaluateValueAsync(value.between[1], record, ctx);
      return compare(val, low) >= 0 && compare(val, high) <= 0;
    }

    case "isNull": {
      const val = await evaluateValueAsync(value.isNull, record, ctx);
      return val === null || val === undefined;
    }

    case "exists": {
      // For correlated subqueries, we need to temporarily update the aliases
      // so the subquery can reference the current outer record's values.
      // Store all current aliases that might be overwritten
      const savedAliases = new Map<string, DataRecord[]>();
      
      // Get all source references in the current record and set them as single-record aliases
      for (const [alias, records] of ctx.aliases) {
        savedAliases.set(alias, records);
        // Find if the current record matches this alias
        const matchingRecord = records.find(r => r.id === record.id);
        if (matchingRecord) {
          ctx.aliases.set(alias, [matchingRecord]);
        }
      }
      
      try {
        // Execute the EXISTS subquery
        const subResult = await executeStatement(value.exists, ctx);
        return subResult.rows.length > 0;
      } finally {
        // Restore original aliases
        for (const [alias, records] of savedAliases) {
          ctx.aliases.set(alias, records);
        }
      }
    }

    case "and": {
      for (const v of value.and) {
        if (!(await evaluateSingleBooleanAsync(v, record, ctx))) {
          return false;
        }
      }
      return true;
    }

    case "or": {
      for (const v of value.or) {
        if (await evaluateSingleBooleanAsync(v, record, ctx)) {
          return true;
        }
      }
      return false;
    }

    case "not":
      return !(await evaluateSingleBooleanAsync(value.not, record, ctx));

    default:
      return false;
  }
}

/**
 * Evaluate a single boolean value with group records (for HAVING clause)
 */
async function evaluateSingleBooleanWithGroupAsync(
  value: BooleanValue,
  record: DataRecord,
  ctx: QueryContext,
  groupRecords: DataRecord[]
): Promise<boolean> {
  switch (value.kind) {
    case "comparison": {
      const left = await evaluateValueAsync(value.left, record, ctx, groupRecords);
      const right = await evaluateValueAsync(value.right, record, ctx, groupRecords);
      return evaluateComparison(left, value.cmp, right);
    }

    case "in": {
      const val = await evaluateValueAsync(value.value, record, ctx, groupRecords);
      if (Array.isArray(value.in)) {
        for (const v of value.in) {
          if (compare(await evaluateValueAsync(v, record, ctx, groupRecords), val) === 0) {
            return true;
          }
        }
        return false;
      }
      // Subquery IN
      const subResult = await executeStatement(value.in, ctx);
      const subValues = subResult.rows.map(r => Object.values(r)[0]);
      return subValues.some(x => compare(x, val) === 0);
    }

    case "between": {
      const val = await evaluateValueAsync(value.value, record, ctx, groupRecords);
      const low = await evaluateValueAsync(value.between[0], record, ctx, groupRecords);
      const high = await evaluateValueAsync(value.between[1], record, ctx, groupRecords);
      return compare(val, low) >= 0 && compare(val, high) <= 0;
    }

    case "isNull": {
      const val = await evaluateValueAsync(value.isNull, record, ctx, groupRecords);
      return val === null || val === undefined;
    }

    case "exists": {
      const subResult = await executeStatement(value.exists, ctx);
      return subResult.rows.length > 0;
    }

    case "and": {
      for (const v of value.and) {
        if (!(await evaluateSingleBooleanWithGroupAsync(v, record, ctx, groupRecords))) {
          return false;
        }
      }
      return true;
    }

    case "or": {
      for (const v of value.or) {
        if (await evaluateSingleBooleanWithGroupAsync(v, record, ctx, groupRecords)) {
          return true;
        }
      }
      return false;
    }

    case "not":
      return !(await evaluateSingleBooleanWithGroupAsync(value.not, record, ctx, groupRecords));

    default:
      return false;
  }
}

/**
 * Get a column value from a DataRecord, handling internal columns (id, created, updated)
 */
function getColumnValue(record: DataRecord, column: string): unknown {
  if (column === 'id') {
    return record.id;
  }
  if (column === 'created') {
    return record.created;
  }
  if (column === 'updated') {
    return record.updated;
  }
  return record.fields[column];
}

/**
 * Evaluate a value expression - async version for subquery support
 */
async function evaluateValueAsync(
  value: Value,
  record: DataRecord | null,
  ctx: QueryContext,
  groupRecords?: DataRecord[]
): Promise<unknown> {
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
      // For combined records from joins, check stored original records
      const recordAny = record as { __left__?: DataRecord; __right__?: DataRecord };
      if (recordAny.__left__ || recordAny.__right__) {
        // This is a combined record - check which alias it came from
        const leftRecord = recordAny.__left__;
        const rightRecord = recordAny.__right__;

        // Try to find which original record matches this alias
        let sourceRecord: DataRecord | undefined;
        if (leftRecord && aliasRecords.some(r => r.id === leftRecord.id)) {
          sourceRecord = leftRecord;
        } else if (rightRecord && aliasRecords.some(r => r.id === rightRecord.id)) {
          sourceRecord = rightRecord;
        }

        if (sourceRecord) {
          return getColumnValue(sourceRecord, value.column);
        }
      } else {
        // Regular record - first try to find it in the alias by ID match
        const aliasRecord = aliasRecords.find((r) => r.id === record.id);
        if (aliasRecord) {
          return getColumnValue(aliasRecord, value.column);
        }
        
        // If we have exactly one record in the alias (e.g., for correlated subqueries),
        // use that record directly - this handles cross-context lookups
        if (aliasRecords.length === 1) {
          const singleRecord = aliasRecords[0];
          return getColumnValue(singleRecord, value.column);
        }
      }
    }

    return getColumnValue(record, value.column);
  }

  // Handle complex value types
  if (typeof value === "object" && "kind" in value) {
    switch (value.kind) {
      case "select": {
        // Execute the scalar subquery
        const subResult = await executeSelect(value, ctx);
        if (subResult.rows.length === 0) return null;
        // Return the first value from the first row
        const firstRow = subResult.rows[0];
        const keys = Object.keys(firstRow);
        return keys.length > 0 ? firstRow[keys[0]] : null;
      }

      case "binary": {
        const left = await evaluateValueAsync(value.left, record, ctx, groupRecords);
        const right = await evaluateValueAsync(value.right, record, ctx, groupRecords);
        return evaluateBinaryOp(left, value.op, right);
      }

      case "unary": {
        const operand = await evaluateValueAsync(value.value, record, ctx, groupRecords);
        if (value.unary === "-" && typeof operand === "number") {
          return -operand;
        }
        return operand;
      }

      case "aggregate": {
        const records = groupRecords || (record ? [record] : []);
        return await evaluateAggregateAsync(
          value.aggregate,
          value.value,
          records,
          ctx
        );
      }

      case "function": {
        return await evaluateFunctionAsync(value, record, ctx, groupRecords);
      }

      case "window": {
        return await evaluateWindowAsync(value, record, ctx, groupRecords);
      }

      case "case": {
        for (const branch of value.case) {
          if (record && await evaluateSingleBooleanAsync(branch.when, record, ctx)) {
            return await evaluateValueAsync(branch.then, record, ctx, groupRecords);
          }
        }
        return value.else !== undefined && value.else !== null
          ? await evaluateValueAsync(value.else, record, ctx, groupRecords)
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
          ? await evaluateSingleBooleanAsync(value as BooleanValue, record, ctx)
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
 * Evaluate an aggregate function - async version
 */
async function evaluateAggregateAsync(
  aggregate: string,
  valueExpr: Value | "*",
  records: DataRecord[],
  ctx: QueryContext
): Promise<unknown> {
  if (valueExpr === "*") {
    if (aggregate === "count") {
      return records.length;
    }
    return null;
  }

  const values: unknown[] = [];
  for (const r of records) {
    const v = await evaluateValueAsync(valueExpr, r, ctx);
    if (v !== null && v !== undefined) {
      values.push(v);
    }
  }

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
      return values.reduce((min, v) => (compare(v, min) < 0 ? v : min));
    }
    case "max": {
      if (values.length === 0) return null;
      return values.reduce((max, v) => (compare(v, max) > 0 ? v : max));
    }
    default:
      return null;
  }
}

/**
 * Evaluate a function call - async version
 */
async function evaluateFunctionAsync(
  func: FunctionCall,
  record: DataRecord | null,
  ctx: QueryContext,
  groupRecords?: DataRecord[]
): Promise<unknown> {
  const args: unknown[] = [];
  for (const arg of func.args) {
    args.push(await evaluateValueAsync(arg, record, ctx, groupRecords));
  }

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
 * Evaluate a window function - async version
 */
async function evaluateWindowAsync(
  window: WindowValue,
  record: DataRecord | null,
  ctx: QueryContext,
  groupRecords?: DataRecord[]
): Promise<unknown> {
  // Window functions need access to the full partition
  // For simplicity, use groupRecords if available
  const records = groupRecords || (record ? [record] : []);

  // Apply partition if specified
  let partitionedRecords = records;
  if (window.partitionBy?.length && record) {
    const partitionKeyValues: unknown[] = [];
    for (const v of window.partitionBy) {
      partitionKeyValues.push(await evaluateValueAsync(v, record, ctx));
    }
    const partitionKey = JSON.stringify(partitionKeyValues);

    const filtered: DataRecord[] = [];
    for (const r of records) {
      const keyValues: unknown[] = [];
      for (const v of window.partitionBy) {
        keyValues.push(await evaluateValueAsync(v, r, ctx));
      }
      if (JSON.stringify(keyValues) === partitionKey) {
        filtered.push(r);
      }
    }
    partitionedRecords = filtered;
  }

  // Apply ordering if specified
  if (window.orderBy?.length) {
    partitionedRecords = [...partitionedRecords];
    // Use a simple sync sort since values should already be evaluated
    partitionedRecords.sort((a, b) => {
      for (const sort of window.orderBy!) {
        // Evaluate synchronously for sorting (simplified)
        const aVal = evaluateValueSync(sort.value, a, ctx);
        const bVal = evaluateValueSync(sort.value, b, ctx);
        const cmp = compare(aVal, bVal)
        if (cmp !== 0) {
          return sort.dir === "desc" ? -cmp : cmp;
        }
      }
      return 0;
    });
  }

  // Evaluate the window function
  return await evaluateAggregateAsync(
    window.function,
    window.value,
    partitionedRecords,
    ctx
  );
}

/**
 * Synchronous value evaluation for simple cases (sorting)
 */
function evaluateValueSync(
  value: Value,
  record: DataRecord | null,
  ctx: QueryContext
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (isSourceColumn(value)) {
    if (!record) return null;
    const aliasRecords = ctx.aliases.get(value.source);
    if (aliasRecords?.length) {
      const aliasRecord = aliasRecords.find((r) => r.id === record.id);
      if (aliasRecord) {
        return getColumnValue(aliasRecord, value.column);
      }
    }
    return getColumnValue(record, value.column);
  }
  return null;
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
      return compare(left, right) === 0;
    case "<>":
      return compare(left, right) !== 0;
    case "<":
      return compare(left, right) < 0;
    case ">":
      return compare(left, right) > 0;
    case "<=":
      return compare(left, right) <= 0;
    case ">=":
      return compare(left, right) >= 0;
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
 * Group records by specified values - uses JSON.stringify for key
 */
function groupRecords(
  records: DataRecord[],
  groupBy: Value[],
  ctx: QueryContext
): Map<string, DataRecord[]> {
  const groups = new Map<string, DataRecord[]>();

  for (const record of records) {
    const keyValues: unknown[] = [];
    for (const v of groupBy) {
      keyValues.push(evaluateValueSync(v, record, ctx));
    }
    const key = JSON.stringify(keyValues);

    const group = groups.get(key) || [];
    group.push(record);
    groups.set(key, group);
  }

  return groups;
}

/**
 * Sort rows by specified criteria - async version
 */
async function sortRowsAsync(
  rows: Record<string, unknown>[],
  orderBy: Sort[],
  ctx: QueryContext
): Promise<Record<string, unknown>[]> {
  // Create temp records and evaluate sort values
  const rowsWithValues: Array<{
    row: Record<string, unknown>;
    sortValues: unknown[];
  }> = [];

  for (const row of rows) {
    const tempRecord: DataRecord = {
      id: "",
      created: 0,
      updated: 0,
      fields: row as Record<string, unknown>,
    };
    const sortValues: unknown[] = [];
    for (const sort of orderBy) {
      sortValues.push(await evaluateValueAsync(sort.value, tempRecord, ctx));
    }
    rowsWithValues.push({ row, sortValues });
  }

  // Sort using pre-evaluated values
  rowsWithValues.sort((a, b) => {
    for (let i = 0; i < orderBy.length; i++) {
      const aVal = a.sortValues[i];
      const bVal = b.sortValues[i];
      const cmp = compare(aVal, bVal);
      if (cmp !== 0) {
        return orderBy[i].dir === "desc" ? -cmp : cmp;
      }
    }
    return 0;
  });

  return rowsWithValues.map((r) => r.row);
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
        value.case.some((c) => containsAggregate(c.then)) ||
        (value.else !== undefined &&
          value.else !== null &&
          containsAggregate(value.else))
      );
    }
  }

  return false;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  const anull = a === null || a === undefined;
  const bnull = b === null || b === undefined;
  if (anull && bnull) return 0;  // Both null/undefined are equal
  if (anull && !bnull) return -1;
  if (!anull && bnull) return 1;
  if (typeof a === "number" && typeof b === "number") {
    return a < b ? -1 : 1;
  }
  const astr = String(a);
  const bstr = String(b);
  return astr < bstr ? -1 : 1;
}
