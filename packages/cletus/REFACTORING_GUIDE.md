# DBA Query V2 Refactoring Guide

## Overview

This document outlines the refactoring patterns for dba-query-v2.ts to:
1. Remove `resolveType()` - validation happens during `eval()`
2. Move helper functions into their respective Expr classes
3. Add `isAssignableTo()` and `isComparableWith()` to Value class
4. Validate Insert/Update operations including enum checks
5. Replace `collectReferencedTables()` with `walk()` pattern and `getReferencedTables()`

## Changes to Value Class

### Added Methods

```typescript
/**
 * Get runtime type of value
 */
getType(): string {
  if (this.isNull()) return 'null';
  if (typeof this.value === 'number') return 'number';
  // ... etc
}

/**
 * Check if value can be assigned to a field
 * Handles: null checks, enum validation, type validation, foreign keys
 */
isAssignableTo(field: TypeField, ctx: QueryContext): { valid: boolean; error?: QueryValidationError }

/**
 * Check if value can be compared with another
 */
isComparableWith(other: Value, operator: string): { valid: boolean; error?: string }

/**
 * Compare values for sorting
 */
compareTo(other: Value): number
```

## Changes to Expr Base Class

### Removed
- `resolveType()` method
- `resolvedField` and `resolvedType` properties
- `collectReferencedTables()` method

### Added
```typescript
/**
 * Walk the expression tree with visitor pattern
 */
walk(visitor: (expr: Expr) => boolean | void): void

/**
 * Override to walk children (default: no children)
 */
protected walkChildren(visitor: (expr: Expr) => boolean | void): void

/**
 * Get all referenced tables using walk
 */
getReferencedTables(target?: Set<string>): Set<string>
```

## Refactoring Pattern for Each Expr Class

### Before (Old Pattern):
```typescript
export class BinaryExpr extends Expr {
  resolveType(ctx: QueryContext): QueryValidationError[] {
    return [
      ...this.left.resolveType(ctx),
      ...this.right.resolveType(ctx)
    ];
  }

  async eval(...): Promise<Value> {
    const leftValue = await this.left.eval(...);
    const rightValue = await this.right.eval(...);
    const result = evaluateBinaryOp(leftValue.value, this.op, rightValue.value);
    return new Value(result);
  }

  collectReferencedTables(tables: Set<string>): void {
    this.left.collectReferencedTables(tables);
    this.right.collectReferencedTables(tables);
  }
}
```

### After (New Pattern):
```typescript
export class BinaryExpr extends Expr {
  // Remove resolveType entirely

  async eval(record: DataRecord | null, ctx: QueryContext, groupRecords?: DataRecord[]): Promise<Value> {
    const leftValue = await this.left.eval(record, ctx, groupRecords);
    const rightValue = await this.right.eval(record, ctx, groupRecords);

    // Validate during eval
    if (leftValue.isNull() || rightValue.isNull()) {
      return new Value(null);
    }

    // Use Value's type checking
    const leftType = leftValue.getType();
    const rightType = rightValue.getType();

    if (leftType !== rightType) {
      ctx.validationErrors.push({
        path: this.path,
        message: `Cannot perform '${this.op}' on ${leftType} and ${rightType}`,
        actualType: `${leftType} ${this.op} ${rightType}`,
        suggestion: 'Ensure both operands are the same type'
      });
      return new Value(null);
    }

    // Perform operation
    return this.evalBinaryOp(leftValue, rightValue);
  }

  // Move helper into class as private/static method
  private evalBinaryOp(left: Value, right: Value): Value {
    const l = left.toNumber();
    const r = right.toNumber();

    if (isNaN(l) || isNaN(r)) {
      if (this.op === '+') {
        return new Value(left.toString() + right.toString());
      }
      return new Value(null);
    }

    switch (this.op) {
      case '+': return new Value(l + r);
      case '-': return new Value(l - r);
      case '*': return new Value(l * r);
      case '/': return new Value(r !== 0 ? l / r : null);
      default: return new Value(null);
    }
  }

  // Replace collectReferencedTables with walkChildren
  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    this.left.walk(visitor);
    this.right.walk(visitor);
  }
}
```

## Comparison Expressions

### ComparisonExpr Pattern:
```typescript
async evalBoolean(record: DataRecord, ctx: QueryContext, groupRecords?: DataRecord[]): Promise<boolean> {
  const leftValue = await this.left.eval(record, ctx, groupRecords);
  const rightValue = await this.right.eval(record, ctx, groupRecords);

  // SQL NULL semantics
  if (leftValue.isNull() && rightValue.isNull()) {
    return this.cmp === '=' || this.cmp === '>=';
  }
  if (leftValue.isNull() || rightValue.isNull()) {
    return false;
  }

  // Use Value's comparability check
  const compatibility = leftValue.isComparableWith(rightValue, this.cmp);
  if (!compatibility.valid) {
    ctx.validationErrors.push({
      path: this.path,
      message: compatibility.error!,
      suggestion: 'Ensure operands are compatible types'
    });
    return false;
  }

  // Perform comparison
  switch (this.cmp) {
    case '=': return leftValue.compareTo(rightValue) === 0;
    case '<>': return leftValue.compareTo(rightValue) !== 0;
    case '<': return leftValue.compareTo(rightValue) < 0;
    case '>': return leftValue.compareTo(rightValue) > 0;
    case '<=': return leftValue.compareTo(rightValue) <= 0;
    case '>=': return leftValue.compareTo(rightValue) >= 0;
    case 'like':
    case 'notLike':
      return this.evalLike(leftValue, rightValue);
  }
}

private evalLike(left: Value, right: Value): boolean {
  const pattern = right.toString()
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  const result = new RegExp(`^${pattern}$`, 'i').test(left.toString());
  return this.cmp === 'like' ? result : !result;
}
```

## Function Call Expressions

### FunctionCallExpr Pattern:
```typescript
async eval(record: DataRecord | null, ctx: QueryContext, groupRecords?: DataRecord[]): Promise<Value> {
  // Evaluate all arguments
  const argValues: Value[] = [];
  for (const arg of this.args) {
    argValues.push(await arg.eval(record, ctx, groupRecords));
  }

  // Validate and execute function
  return this.executeFunction(argValues, ctx);
}

private executeFunction(args: Value[], ctx: QueryContext): Value {
  switch (this.func) {
    case 'concat':
      return new Value(args.map(a => a.toString()).join(''));

    case 'substring': {
      if (args.length < 2) {
        ctx.validationErrors.push({
          path: this.path,
          message: `substring requires at least 2 arguments, got ${args.length}`,
          suggestion: 'Provide string, start, and optional length'
        });
        return new Value(null);
      }

      const str = args[0].toString();
      const start = args[1].toNumber();
      const length = args[2]?.toNumber();

      return new Value(
        length !== undefined
          ? str.substring(start, start + length)
          : str.substring(start)
      );
    }

    case 'abs': {
      if (args[0].getType() !== 'number') {
        ctx.validationErrors.push({
          path: this.path,
          message: `abs() requires a number, got ${args[0].getType()}`,
          expectedType: 'number',
          actualType: args[0].getType(),
          suggestion: 'Provide a numeric value'
        });
        return new Value(null);
      }
      return new Value(Math.abs(args[0].toNumber()));
    }

    // ... all other functions with validation
  }
}
```

## Insert/Update Validation

### InsertExpr Pattern:
```typescript
async execute(ctx: QueryContext): Promise<QueryResult> {
  const tableName = this.table.toLowerCase();
  const typeDef = ctx.types.get(tableName);

  if (!typeDef) {
    ctx.validationErrors.push({
      path: this.path,
      message: `Table '${tableName}' does not exist`,
      suggestion: 'Check table name spelling'
    });
    return { rows: [], canCommit: false };
  }

  const state = await getTableState(tableName, ctx);

  // Get values (from VALUES or SELECT)
  const valueSets = await this.getValueSets(ctx);

  // Process each row to insert
  const insertedRows: Record<string, unknown>[] = [];

  for (const values of valueSets) {
    // Map column names to values
    const fields: Record<string, unknown> = {};

    for (let i = 0; i < this.columns.length; i++) {
      const columnName = this.columns[i];
      const value = values[i];

      // Find field definition
      const field = typeDef.fields.find(f => f.name === columnName);
      if (!field) {
        ctx.validationErrors.push({
          path: `${this.path}.columns[${i}]`,
          message: `Column '${columnName}' does not exist on table '${tableName}'`,
          suggestion: `Available columns: ${typeDef.fields.map(f => f.name).join(', ')}`
        });
        continue;
      }

      // VALIDATE using Value.isAssignableTo
      const assignability = value.isAssignableTo(field, ctx);
      if (!assignability.valid) {
        const error = assignability.error!;
        error.path = `${this.path}.values[${i}]`;
        ctx.validationErrors.push(error);
        continue;
      }

      fields[columnName] = value.value;
    }

    // Generate ID and add to state
    const id = uuidv4();
    const record = addInsert(state, id, fields);
    insertedRows.push({ id, ...fields });
  }

  // Process RETURNING clause if present
  if (this.returning) {
    const rows = await this.evaluateReturning(insertedRows, ctx);
    return { rows, canCommit: ctx.validationErrors.length === 0 };
  }

  return { rows: [], canCommit: ctx.validationErrors.length === 0 };
}
```

### UpdateExpr Pattern:
```typescript
async execute(ctx: QueryContext): Promise<QueryResult> {
  // Similar to Insert, but:
  // 1. Filter records with WHERE clause
  // 2. For each matching record:
  //    - Evaluate SET expressions
  //    - Validate assignability using Value.isAssignableTo
  //    - Apply updates to state

  for (const record of matchingRecords) {
    const updates: Record<string, unknown> = {};

    for (const { column, expr } of this.set) {
      const field = typeDef.fields.find(f => f.name === column);
      if (!field) {
        ctx.validationErrors.push({
          path: `${this.path}.set.${column}`,
          message: `Column '${column}' does not exist`,
          suggestion: `Available: ${typeDef.fields.map(f => f.name).join(', ')}`
        });
        continue;
      }

      const value = await expr.eval(record, ctx);

      // Validate assignment
      const assignability = value.isAssignableTo(field, ctx);
      if (!assignability.valid) {
        const error = assignability.error!;
        error.path = `${this.path}.set.${column}`;
        ctx.validationErrors.push(error);
        continue;
      }

      updates[column] = value.value;
    }

    addUpdate(state, record.id, updates);
  }
}
```

## Example: Complete Refactored SourceColumnExpr

```typescript
export class SourceColumnExpr extends Expr {
  private readonly source: string;
  private readonly column: string;

  constructor(path: string, source: string, column: string) {
    super(path);
    this.source = source.toLowerCase();
    this.column = column.toLowerCase();
  }

  // NO resolveType() method

  async eval(record: DataRecord | null, ctx: QueryContext, groupRecords?: DataRecord[]): Promise<Value> {
    if (!record) return new Value(null);

    // Validate column exists on type (runtime validation)
    const typeDef = ctx.types.get(this.source);
    if (typeDef && this.column !== '*') {
      const systemFields = ['id', 'created', 'updated'];
      const field = typeDef.fields.find(f => f.name === this.column);

      if (!field && !systemFields.includes(this.column)) {
        ctx.validationErrors.push({
          path: this.path,
          message: `Column '${this.column}' does not exist on '${this.source}'`,
          suggestion: `Available: ${systemFields.concat(typeDef.fields.map(f => f.name)).join(', ')}`,
          metadata: { source: this.source, column: this.column }
        });
        return new Value(null);
      }

      // Extract value with field metadata
      const value = this.getColumnValue(record, this.column, ctx);
      return new Value(value, field, typeDef);
    }

    // Handle wildcards and extract value
    const value = this.column === '*'
      ? this.getAllColumnValues(record)
      : this.getColumnValue(record, this.column, ctx);

    return new Value(value);
  }

  // Helper methods moved into class
  private getColumnValue(record: DataRecord, column: string, ctx: QueryContext): unknown {
    // Check aliases for joined records
    const aliasRecords = ctx.aliases.get(this.source);
    if (aliasRecords) {
      const recordAny = record as any;
      if (recordAny.__left__ || recordAny.__right__) {
        // Handle joined records
        const sourceRecord = aliasRecords.find(r =>
          r.id === recordAny.__left__?.id || r.id === recordAny.__right__?.id
        );
        if (sourceRecord) {
          return this.extractColumnValue(sourceRecord, column);
        }
      }
    }

    // Direct field access
    return this.extractColumnValue(record, column);
  }

  private extractColumnValue(record: DataRecord, column: string): unknown {
    if (column === 'id') return record.id;
    if (column === 'created') return record.created;
    if (column === 'updated') return record.updated;
    return record.fields[column];
  }

  private getAllColumnValues(record: DataRecord): Record<string, unknown> {
    return {
      id: record.id,
      created: record.created,
      updated: record.updated,
      ...record.fields
    };
  }

  // NO collectReferencedTables() - handled by getReferencedTables() in base class via walk

  // Accessor for walk pattern
  getSource(): string {
    return this.source;
  }

  // No children to walk
  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    // SourceColumnExpr has no children
  }
}
```

## Migration Steps

1. **Update Value class** ✓ (Already done)
   - Add `getType()`, `isAssignableTo()`, `isComparableWith()`, `compareTo()`

2. **Update Expr base class** ✓ (Already done)
   - Remove `resolveType()`
   - Add `walk()`, `walkChildren()`, `getReferencedTables()`

3. **Refactor each Expr subclass** (Pattern shown above)
   - Remove `resolveType()` implementation
   - Move validation into `eval()`
   - Move helper functions into class as private/static methods
   - Replace `collectReferencedTables()` with `walkChildren()`

4. **Update factory functions**
   - Remove calls to `resolveType()`
   - Update `executeQueryV2()` to skip type resolution phase

5. **Test compilation**
   - Fix any TypeScript errors
   - Verify all validation happens at runtime

## Benefits

1. **Simpler architecture** - Single pass evaluation with validation
2. **Better encapsulation** - Each Expr contains all its logic
3. **Flexible validation** - Validation errors collected but execution continues
4. **Reusable walk pattern** - Easy to add new tree traversals
5. **Runtime type safety** - Value class handles all type checking
