import { v4 as uuidv4 } from 'uuid';
import { DataFile, DataRecord, SelectRecord, TypeDefinition, TypeField } from "../schemas";
import type {
  Aggregate,
  BooleanValue as BooleanValueDBA,
  Binary,
  Comparison,
  Constant,
  CTEStatement,
  DataSource as DataSourceDBA,
  Delete as DeleteDBA,
  Function as FunctionType,
  FunctionCall as FunctionCallType,
  Insert as InsertDBA,
  Join as JoinDBA,
  Query,
  Select as SelectDBA,
  SelectOrSet,
  SetOperation as SetOperationDBA,
  Sort as SortDBA,
  SourceColumn as SourceColumnDBA,
  Statement,
  Unary,
  Update as UpdateDBA,
  Value as ValueDBA,
  WindowValue as WindowValueType,
  WithStatement,
} from "./dba";
import { create } from 'handlebars';

/**
 * Validation error collected during query execution
 */
export interface QueryValidationError {
  /** Path in query where error occurred (e.g., "insert.values[0]", "where[1].left") */
  path: string;
  /** Human-readable error message */
  message: string;
  /** Expected field type (if applicable) */
  expectedType?: string;
  /** Actual value type received */
  actualType?: string;
  /** Suggestion for how to fix the error */
  suggestion?: string;
  /** Additional metadata for programmatic handling */
  metadata?: Record<string, unknown>;
}

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
  /** Validation errors collected during execution */
  validationErrors?: QueryValidationError[];
  /** Whether the query can be committed (false if validation errors exist) */
  canCommit: boolean;
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
 * Serializable table delta containing only the changes to be applied
 */
export interface TableDelta {
  /** Table name */
  tableName: string;
  /** Version hash when the query was executed */
  version: string;
  /** Records to insert (temp ID -> field values) */
  inserts: Array<{ tempId: string; fields: Record<string, unknown> }>;
  /** Records to update (real ID -> field values to update) */
  updates: Array<Omit<DataRecord, 'created' | 'updated'>>;
  /** Record IDs to delete */
  deletes: string[];
}

/**
 * Execution payload that can be passed to commitQueryChanges
 * Contains only serializable deltas and versions
 */
export interface QueryExecutionPayload {
  /** The query result with temporary IDs for inserts */
  result: QueryResult;
  /** Deltas for each affected table */
  deltas: TableDelta[];
}

/**
 * Result of checking if a query execution payload can be committed
 */
export interface CanCommitResult {
  /** Whether the payload can be committed */
  canCommit: boolean;
  /** Reason why it cannot be committed (if canCommit is false) */
  reason?: string;
  /** Tables that have been modified since the query was executed */
  modifiedTables?: string[];
}


/**
 * =============================================================================
 * VALUE RESULT CLASS
 * =============================================================================
 *
 * All expressions evaluate to Value instances containing:
 * - value: The runtime computed value
 * - field: Schema field definition (optional, for validation)
 * - type: Schema type definition (optional, for validation)
 */
export class Value {
  constructor(
    public readonly value: unknown,
    public readonly field?: TypeField,
    public readonly type?: TypeDefinition
  ) {}

  isNull(): boolean {
    return this.value === null || this.value === undefined;
  }

  toString(): string {
    return String(this.value ?? '');
  }

  toNumber(): number {
    return Number(this.value);
  }

  toBoolean(): boolean {
    return Boolean(this.value);
  }

  /**
   * Get the runtime type of this value
   */
  getType(): string {
    if (this.isNull()) return 'null';
    if (typeof this.value === 'number') return 'number';
    if (typeof this.value === 'string') return 'string';
    if (typeof this.value === 'boolean') return 'boolean';
    if (this.value instanceof Date) return 'date';
    return 'unknown';
  }

  /**
   * Check if this value can be assigned to a field
   */
  isAssignableTo(field: TypeField, ctx: QueryContext): { valid: boolean; error?: QueryValidationError } {
    // Null handling
    if (this.isNull()) {
      if (field.required) {
        return {
          valid: false,
          error: {
            path: '',
            message: `Cannot assign null to required field '${field.name}'`,
            expectedType: field.type,
            actualType: 'null',
            suggestion: `Provide a non-null value for ${field.name}`
          }
        };
      }
      return { valid: true };
    }

    // Enum validation
    if (field.enumOptions && field.enumOptions.length > 0) {
      const strValue = String(this.value);
      if (!field.enumOptions.includes(strValue)) {
        return {
          valid: false,
          error: {
            path: '',
            message: `Value '${strValue}' is not a valid option for enum field '${field.name}'`,
            expectedType: field.enumOptions.join(' | '),
            actualType: strValue,
            suggestion: `Valid options: ${field.enumOptions.join(', ')}`
          }
        };
      }
      return { valid: true };
    }

    // Type validation
    const valueType = this.getType();
    const fieldType = field.type;

    // Check if field type is a reference to another type (foreign key)
    const referencedType = ctx.types.get(fieldType.toLowerCase());
    if (referencedType) {
      // Foreign key - value should be a string (ID)
      if (valueType !== 'string') {
        return {
          valid: false,
          error: {
            path: '',
            message: `Foreign key field '${field.name}' expects a string ID, got ${valueType}`,
            expectedType: 'string',
            actualType: valueType,
            suggestion: `Provide a valid ${fieldType} ID`
          }
        };
      }
      return { valid: true };
    }

    // Primitive type validation
    const typeMap: Record<string, string> = {
      'string': 'string',
      'number': 'number',
      'boolean': 'boolean',
      'date': 'string' // dates stored as strings
    };

    const expectedRuntimeType = typeMap[fieldType] || fieldType;
    if (valueType !== expectedRuntimeType) {
      return {
        valid: false,
        error: {
          path: '',
          message: `Cannot assign ${valueType} to ${fieldType} field '${field.name}'`,
          expectedType: fieldType,
          actualType: valueType,
          suggestion: `Provide a ${fieldType} value`
        }
      };
    }

    return { valid: true };
  }

  /**
   * Check if this value can be compared with another value
   */
  isComparableWith(other: Value, operator: string): { valid: boolean; error?: string } {
    // NULL handling
    if (this.isNull() || other.isNull()) {
      return { valid: true }; // SQL NULL semantics handled elsewhere
    }

    const thisType = this.getType();
    const otherType = other.getType();

    // LIKE operator only works with strings
    if (operator === 'like' || operator === 'notLike') {
      if (thisType !== 'string' || otherType !== 'string') {
        return {
          valid: false,
          error: `${operator.toUpperCase()} operator requires string operands, got ${thisType} and ${otherType}`
        };
      }
      return { valid: true };
    }

    // Other operators require same type
    if (thisType !== otherType) {
      return {
        valid: false,
        error: `Cannot compare ${thisType} with ${otherType}`
      };
    }

    return { valid: true };
  }

  /**
   * Compare this value with another for sorting/comparison
   */
  compareTo(other: Value): number {
    if (this.value === other.value) return 0;

    const thisNull = this.isNull();
    const otherNull = other.isNull();

    if (thisNull && otherNull) return 0;
    if (thisNull && !otherNull) return -1;
    if (!thisNull && otherNull) return 1;

    if (typeof this.value === 'number' && typeof other.value === 'number') {
      return this.value < other.value ? -1 : 1;
    }

    const thisStr = String(this.value);
    const otherStr = String(other.value);
    return thisStr < otherStr ? -1 : 1;
  }
}

/**
 * =============================================================================
 * QUERY CONTEXT
 * =============================================================================
 *
 * Context threaded through all expression evaluation
 */
export interface QueryContext {
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
  /** Validation errors collected during execution */
  validationErrors: QueryValidationError[];
  /** Map of table name -> column name -> field type for validation */
  fieldTypes: Map<string, Map<string, string>>;
}

/**
 * Transactional state for a table
 */
export interface TableState {
  /** Original records loaded from disk */
  original: DataRecord[];
  /** Current records including pending changes */
  current: DataRecord[];
  /** Set of IDs that have been deleted */
  deleted: Set<string>;
  /** Map of IDs to their updated fields */
  updated: Map<string, Record<string, unknown>>;
  /** Map of IDs to their insert fields (for new records) */
  inserted: Map<string, Record<string, unknown>>;
  /** Version hash of the table when loaded */
  version: string;
}

/**
 * =============================================================================
 * ABSTRACT BASE CLASS: EXPR
 * =============================================================================
 *
 * All expressions extend this base class
 */
export abstract class Expr {
  constructor(protected readonly path: string) {}

  /**
   * Evaluate expression to a Value
   * Validation happens during evaluation - errors are added to ctx.validationErrors
   * @param record - SelectRecord mapping source names to DataRecords, or null
   * @param groupRecords - For aggregate functions, array of SelectRecords
   */
  abstract eval(
    record: SelectRecord | null,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<Value>;

  /**
   * Walk the expression tree and call visitor on each node
   * Visitor can return false to stop traversal of children
   */
  walk(visitor: (expr: Expr) => boolean | void): void {
    const continueWalking = visitor(this);
    if (continueWalking === false) return;

    // Default: no children (override in subclasses that have children)
    this.walkChildren(visitor);
  }

  /**
   * Override in subclasses to walk child expressions
   */
  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    // Default: no children
  }

  /**
   * Get all table names referenced by this expression
   */
  getReferencedTables(target?: Set<string>): Set<string> {
    const tables = target || new Set<string>();
    this.walk((expr) => {
      if (expr instanceof SourceColumnExpr) {
        tables.add(expr.getSource());
      } else if (expr instanceof SemanticSimilarityExpr) {
        tables.add(expr.getTable());
      }
    });
    return tables;
  }

  /**
   * Check if this expression contains an aggregate function
   * Note: This does NOT include window functions or subqueries, which behave differently in SELECT
   */
  containsAggregate(): boolean {
    let hasAggregate = false;
    this.walk((expr) => {
      // Don't walk into subqueries - aggregates inside subqueries don't affect outer query
      if (expr instanceof SelectExpr || expr instanceof SetOperationExpr) {
        return false; // Stop walking into this subtree
      }
      if (expr instanceof AggregateExpr) {
        hasAggregate = true;
        return false; // Stop walking
      }
    });
    return hasAggregate;
  }

  /**
   * Handle wildcard expansion for SELECT/RETURNING clauses
   * If expr is a wildcard SourceColumnExpr and evaluatedValue is an object,
   * expand all properties into the row. Otherwise, assign to alias.
   */
  static handleWildcardExpansion(
    row: Record<string, unknown>,
    alias: string,
    evaluatedValue: Value,
    expr: Expr
  ): void {
    if (
      expr instanceof SourceColumnExpr &&
      expr.isWildcard() &&
      typeof evaluatedValue.value === 'object' &&
      evaluatedValue.value !== null &&
      !Array.isArray(evaluatedValue.value)
    ) {
      // Expand all columns into the row
      Object.assign(row, evaluatedValue.value);
    } else {
      // Regular assignment
      row[alias] = evaluatedValue.value;
    }
  }

  /**
   * Accessors
   */
  getPath(): string {
    return this.path;
  }
}

/**
 * =============================================================================
 * BOOLEAN EXPRESSION BASE CLASS
 * =============================================================================
 */
export abstract class BooleanExpr extends Expr {
  /**
   * Evaluate as boolean (specialized method for boolean expressions)
   */
  abstract evalBoolean(
    record: SelectRecord,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<boolean>;

  /**
   * Default eval delegates to evalBoolean
   */
  async eval(
    record: SelectRecord | null,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<Value> {
    if (!record) return new Value(false);
    const result = await this.evalBoolean(record, ctx, groupRecords);
    return new Value(result);
  }
}

/**
 * =============================================================================
 * VALUE EXPRESSIONS
 * =============================================================================
 */

/**
 * Constant literal value
 */
export class ConstantExpr extends Expr {
  constructor(path: string, private readonly constant: Constant) {
    super(path);
  }

  async eval(
    record: SelectRecord | null,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<Value> {
    return new Value(this.constant);
  }

  // No children to walk
  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {}
}

/**
 * Source column reference (table.column)
 */
export class SourceColumnExpr extends Expr {
  private readonly source: string;
  private readonly column: string;

  constructor(path: string, source: string, column: string) {
    super(path);
    this.source = source.toLowerCase();
    this.column = column.toLowerCase();
  }

  async eval(
    record: SelectRecord | null,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<Value> {
    if (!record) return new Value(null);

    // Validate column exists (runtime validation)
    const typeDef = ctx.types.get(this.source);
    let field: TypeField | undefined;

    if (typeDef && this.column !== '*') {
      const systemFields = ['id', 'created', 'updated'];
      field = typeDef.fields.find(f => f.name === this.column);

      if (!field && !systemFields.includes(this.column)) {
        const availableColumns = systemFields.concat(typeDef.fields.map(f => f.name)).join(', ');
        ctx.validationErrors.push({
          path: this.path,
          message: `Column '${this.column}' does not exist on type '${this.source}'. Valid columns: ${availableColumns}`,
          metadata: { source: this.source, column: this.column }
        });
        return new Value(null);
      }
    }

    // Extract value from SelectRecord
    const value = this.column === '*'
      ? this.getAllColumnValues(record, ctx)
      : this.getColumnValue(record, ctx);

    // Include field metadata if available
    const referencedType = field ? ctx.types.get(field.type) : undefined;
    return new Value(value, field, referencedType);
  }

  private getColumnValue(record: SelectRecord, ctx: QueryContext): unknown {
    // Extract the DataRecord for this source from the SelectRecord
    const dataRecord = record[this.source];

    if (!dataRecord) {
      // For correlated subqueries: check aliases for single record
      const aliasRecords = ctx.aliases.get(this.source);
      if (aliasRecords?.length === 1) {
        return this.extractColumnValue(aliasRecords[0]);
      }

      // Source doesn't exist in SelectRecord (e.g., unmatched side of outer join)
      return undefined;
    }

    return this.extractColumnValue(dataRecord);
  }

  private extractColumnValue(record: DataRecord): unknown {
    if (this.column === 'id') return record.id;
    if (this.column === 'created') return record.created;
    if (this.column === 'updated') return record.updated;
    return record.fields[this.column];
  }

  private getAllColumnValues(record: SelectRecord, ctx: QueryContext): Record<string, unknown> {
    // Extract the DataRecord for this source from the SelectRecord
    const dataRecord = record[this.source];

    if (!dataRecord) {
      // For correlated subqueries: check aliases for single record
      const aliasRecords = ctx.aliases.get(this.source);
      if (aliasRecords?.length === 1) {
        const targetRecord = aliasRecords[0];
        return {
          id: targetRecord.id,
          created: targetRecord.created,
          updated: targetRecord.updated,
          ...targetRecord.fields,
        };
      }

      return {};
    }

    return {
      id: dataRecord.id,
      created: dataRecord.created,
      updated: dataRecord.updated,
      ...dataRecord.fields,
    };
  }

  // Accessor for walk pattern (used by getReferencedTables)
  getSource(): string {
    return this.source;
  }

  // Check if this is a wildcard column reference
  isWildcard(): boolean {
    return this.column === '*';
  }

  // No children to walk
  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {}
}

/**
 * Binary operation (+, -, *, /)
 */
export class BinaryExpr extends Expr {
  constructor(
    path: string,
    private readonly left: Expr,
    private readonly op: Binary,
    private readonly right: Expr
  ) {
    super(path);
  }

  async eval(
    record: SelectRecord | null,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<Value> {
    const leftValue = await this.left.eval(record, ctx, groupRecords);
    const rightValue = await this.right.eval(record, ctx, groupRecords);

    // NULL handling - SQL semantics
    if (leftValue.isNull() || rightValue.isNull()) {
      return new Value(null);
    }

    const leftType = leftValue.getType();
    const rightType = rightValue.getType();

    // Type compatibility check
    if (leftType !== rightType && leftType !== 'null' && rightType !== 'null') {
      ctx.validationErrors.push({
        path: this.path,
        message: `Cannot perform '${this.op}' on ${leftType} and ${rightType}`,
        actualType: `${leftType} ${this.op} ${rightType}`,
        suggestion: 'Ensure both operands are the same type',
        metadata: { operator: this.op, leftType, rightType }
      });
      return new Value(null);
    }

    // Perform operation
    return this.evalBinaryOp(leftValue, rightValue, ctx);
  }

  private evalBinaryOp(left: Value, right: Value, ctx: QueryContext): Value {
    const l = left.toNumber();
    const r = right.toNumber();

    if (isNaN(l) || isNaN(r)) {
      // String concatenation for +
      if (this.op === '+') {
        return new Value(left.toString() + right.toString());
      }
      return new Value(null);
    }

    switch (this.op) {
      case '+': return new Value(l + r);
      case '-': return new Value(l - r);
      case '*': return new Value(l * r);
      case '/':
        if (r === 0) {
          ctx.validationErrors.push({
            path: this.path,
            message: 'Division by zero',
            suggestion: 'Ensure denominator is not zero'
          });
          return new Value(null);
        }
        return new Value(l / r);
      default: return new Value(null);
    }
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    this.left.walk(visitor);
    this.right.walk(visitor);
  }
}

/**
 * Unary operation (-)
 */
export class UnaryExpr extends Expr {
  constructor(
    path: string,
    private readonly unary: Unary,
    private readonly operand: Expr
  ) {
    super(path);
  }

  async eval(
    record: SelectRecord | null,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<Value> {
    const operandValue = await this.operand.eval(record, ctx, groupRecords);

    if (operandValue.isNull()) {
      return new Value(null);
    }

    if (this.unary === '-') {
      if (operandValue.getType() !== 'number') {
        ctx.validationErrors.push({
          path: this.path,
          message: `Unary minus requires a number, got ${operandValue.getType()}`,
          expectedType: 'number',
          actualType: operandValue.getType(),
          suggestion: 'Apply unary minus only to numeric values'
        });
        return new Value(null);
      }
      return new Value(-operandValue.toNumber());
    }

    return operandValue;
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    this.operand.walk(visitor);
  }
}

/**
 * Aggregate function (COUNT, SUM, AVG, MIN, MAX)
 */
export class AggregateExpr extends Expr {
  constructor(
    path: string,
    private readonly aggregate: Aggregate,
    private readonly valueExpr: Expr | '*'
  ) {
    super(path);
  }

  async eval(
    record: SelectRecord | null,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<Value> {
    const records = groupRecords || (record ? [record] : []);

    // Special case: COUNT(*)
    if (this.valueExpr === '*') {
      return new Value(records.length);
    }

    // Evaluate expression for each record, collect Values (not raw values)
    const values: Value[] = [];
    for (const r of records) {
      const v = await this.valueExpr.eval(r, ctx);
      if (!v.isNull()) {
        values.push(v);
      }
    }

    // Apply aggregate function
    return this.evalAggregate(values, ctx);
  }

  private evalAggregate(values: Value[], ctx: QueryContext): Value {
    switch (this.aggregate) {
      case 'count':
        return new Value(values.length);

      case 'sum':
      case 'avg': {
        // Validate all values are numeric
        const nonNumeric = values.filter(v => v.getType() !== 'number');
        if (nonNumeric.length > 0) {
          ctx.validationErrors.push({
            path: this.path,
            message: `${this.aggregate.toUpperCase()} requires numeric values, found ${nonNumeric[0].getType()}`,
            expectedType: 'number',
            actualType: nonNumeric[0].getType(),
            suggestion: `Use ${this.aggregate.toUpperCase()} on numeric columns only`,
            metadata: { aggregate: this.aggregate, nonNumericCount: nonNumeric.length }
          });
          return new Value(0);
        }

        const nums = values.map(v => v.toNumber());
        const result = this.aggregate === 'sum'
          ? nums.reduce((a, b) => a + b, 0)
          : nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
        return new Value(result);
      }

      case 'min':
        if (values.length === 0) return new Value(null);
        return values.reduce((min, v) => v.compareTo(min) < 0 ? v : min);

      case 'max':
        if (values.length === 0) return new Value(null);
        return values.reduce((max, v) => v.compareTo(max) > 0 ? v : max);

      default:
        return new Value(null);
    }
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    if (this.valueExpr !== '*') {
      this.valueExpr.walk(visitor);
    }
  }
}


/**
 * Function call expression
 */
export class FunctionCallExpr extends Expr {
  constructor(
    path: string,
    private readonly func: FunctionType,
    private readonly args: Expr[]
  ) {
    super(path);
  }

  async eval(
    record: SelectRecord | null,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<Value> {
    // Evaluate all arguments
    const argValues: Value[] = [];
    for (const arg of this.args) {
      argValues.push(await arg.eval(record, ctx, groupRecords));
    }

    return this.executeFunction(argValues, ctx);
  }

  /** Validate exact argument count */
  private validateArgCount(args: Value[], expected: number, ctx: QueryContext, suggestion?: string): boolean {
    if (args.length !== expected) {
      ctx.validationErrors.push({
        path: this.path,
        message: `${this.func} requires ${expected} argument${expected !== 1 ? 's' : ''}, got ${args.length}`,
        suggestion: suggestion || `Provide ${expected} argument${expected !== 1 ? 's' : ''}`
      });
      return false;
    }
    return true;
  }

  /** Validate minimum argument count */
  private validateMinArgCount(args: Value[], min: number, ctx: QueryContext, suggestion?: string): boolean {
    if (args.length < min) {
      ctx.validationErrors.push({
        path: this.path,
        message: `${this.func} requires at least ${min} argument${min !== 1 ? 's' : ''}, got ${args.length}`,
        suggestion: suggestion || `Provide at least ${min} argument${min !== 1 ? 's' : ''}`
      });
      return false;
    }
    return true;
  }

  /** Validate argument type */
  private validateArgType(arg: Value, expectedType: string, argIndex: number, ctx: QueryContext): boolean {
    const actualType = arg.getType();
    if (actualType !== expectedType && actualType !== 'null') {
      ctx.validationErrors.push({
        path: this.path,
        message: `${this.func}() argument ${argIndex + 1} expects ${expectedType}, got ${actualType}`,
        expectedType,
        actualType,
        suggestion: `Provide a ${expectedType} value for argument ${argIndex + 1}`
      });
      return false;
    }
    return true;
  }

  /** Validate all arguments are of a specific type */
  private validateAllArgsType(args: Value[], expectedType: string, ctx: QueryContext): boolean {
    for (let i = 0; i < args.length; i++) {
      if (!this.validateArgType(args[i], expectedType, i, ctx)) {
        return false;
      }
    }
    return true;
  }

  private executeFunction(args: Value[], ctx: QueryContext): Value {
    switch (this.func) {
      // String functions
      case 'concat':
        return new Value(args.map(a => a.toString()).join(''));

      case 'substring': {
        if (!this.validateMinArgCount(args, 2, ctx, 'Provide string, start, and optional length')) {
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

      case 'length':
        return new Value(args[0].toString().length);

      case 'lower':
        return new Value(args[0].toString().toLowerCase());

      case 'upper':
        return new Value(args[0].toString().toUpperCase());

      case 'trim':
        return new Value(args[0].toString().trim());

      case 'replace': {
        if (!this.validateArgCount(args, 3, ctx, 'Provide string, search pattern, and replacement')) {
          return new Value(null);
        }
        const str = args[0].toString();
        const search = args[1].toString();
        const replacement = args[2].toString();
        return new Value(str.replace(new RegExp(search, 'g'), replacement));
      }

      // Number functions
      case 'abs':
        if (!this.validateArgType(args[0], 'number', 0, ctx)) return new Value(null);
        return new Value(Math.abs(args[0].toNumber()));

      case 'ceil':
        if (!this.validateArgType(args[0], 'number', 0, ctx)) return new Value(null);
        return new Value(Math.ceil(args[0].toNumber()));

      case 'floor':
        if (!this.validateArgType(args[0], 'number', 0, ctx)) return new Value(null);
        return new Value(Math.floor(args[0].toNumber()));

      case 'round':
        if (!this.validateArgType(args[0], 'number', 0, ctx)) return new Value(null);
        return new Value(Math.round(args[0].toNumber()));

      case 'power':
        if (!this.validateArgCount(args, 2, ctx, 'Provide base and exponent')) return new Value(null);
        if (!this.validateAllArgsType(args, 'number', ctx)) return new Value(null);
        return new Value(Math.pow(args[0].toNumber(), args[1].toNumber()));

      case 'sqrt':
        if (!this.validateArgType(args[0], 'number', 0, ctx)) return new Value(null);
        return new Value(Math.sqrt(args[0].toNumber()));

      // Date functions
      case 'now':
        return new Value(new Date().toISOString());

      case 'current_date':
        return new Value(new Date().toISOString().split('T')[0]);

      case 'date_add':
      case 'date_sub': {
        if (!this.validateMinArgCount(args, 2, ctx, 'Provide date, interval, and optional unit')) {
          return new Value(null);
        }
        const date = new Date(args[0].toString());
        const interval = args[1].toNumber();
        const unit = args[2]?.toString() || 'days';
        const multiplier = this.func === 'date_sub' ? -1 : 1;

        switch (unit.toLowerCase()) {
          case 'years':
            date.setFullYear(date.getFullYear() + interval * multiplier);
            break;
          case 'months':
            date.setMonth(date.getMonth() + interval * multiplier);
            break;
          case 'days':
            date.setDate(date.getDate() + interval * multiplier);
            break;
          case 'hours':
            date.setHours(date.getHours() + interval * multiplier);
            break;
          case 'minutes':
            date.setMinutes(date.getMinutes() + interval * multiplier);
            break;
          case 'seconds':
            date.setSeconds(date.getSeconds() + interval * multiplier);
            break;
        }
        return new Value(date.toISOString());
      }

      case 'extract': {
        if (!this.validateArgCount(args, 2, ctx, 'Provide part (year/month/day/etc) and date')) {
          return new Value(null);
        }
        const part = args[0].toString().toLowerCase();
        const date = new Date(args[1].toString());
        switch (part) {
          case 'year': return new Value(date.getFullYear());
          case 'month': return new Value(date.getMonth() + 1);
          case 'day': return new Value(date.getDate());
          case 'hour': return new Value(date.getHours());
          case 'minute': return new Value(date.getMinutes());
          case 'second': return new Value(date.getSeconds());
          default:
            ctx.validationErrors.push({
              path: this.path,
              message: `Unknown date part '${part}' in extract`,
              suggestion: 'Use year, month, day, hour, minute, or second'
            });
            return new Value(null);
        }
      }

      case 'date_trunc': {
        if (!this.validateArgCount(args, 2, ctx, 'Provide part (year/month/day) and date')) {
          return new Value(null);
        }
        const part = args[0].toString().toLowerCase();
        const date = new Date(args[1].toString());
        switch (part) {
          case 'year':
            return new Value(new Date(date.getFullYear(), 0, 1).toISOString());
          case 'month':
            return new Value(new Date(date.getFullYear(), date.getMonth(), 1).toISOString());
          case 'day':
            return new Value(new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString());
          default:
            ctx.validationErrors.push({
              path: this.path,
              message: `Unknown truncation part '${part}' in date_trunc`,
              suggestion: 'Use year, month, or day'
            });
            return new Value(date.toISOString());
        }
      }

      // Logic functions
      case 'coalesce': {
        const nonNull = args.find(a => !a.isNull());
        return nonNull || new Value(null);
      }

      case 'nullif':
        if (!this.validateArgCount(args, 2, ctx, 'Provide two values to compare')) {
          return new Value(null);
        }
        return args[0].compareTo(args[1]) === 0 ? new Value(null) : args[0];

      case 'greatest': {
        const nonNull = args.filter(a => !a.isNull() && a.getType() === 'number');
        if (nonNull.length === 0) return new Value(null);
        return nonNull.reduce((max, v) => v.compareTo(max) > 0 ? v : max);
      }

      case 'least': {
        const nonNull = args.filter(a => !a.isNull() && a.getType() === 'number');
        if (nonNull.length === 0) return new Value(null);
        return nonNull.reduce((min, v) => v.compareTo(min) < 0 ? v : min);
      }

      default:
        ctx.validationErrors.push({
          path: this.path,
          message: `Unknown function '${this.func}'`,
          suggestion: 'Check function name spelling'
        });
        return new Value(null);
    }
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    for (const arg of this.args) {
      arg.walk(visitor);
    }
  }
}

/**
 * Window function expression
 */
export class WindowExpr extends Expr {
  constructor(
    path: string,
    private readonly windowFunc: Aggregate | string,
    private readonly valueExpr: Expr,
    private readonly partitionBy?: Expr[] | null,
    private readonly orderBy?: { expr: Expr; dir: 'asc' | 'desc' }[] | null
  ) {
    super(path);
  }

  async eval(
    record: SelectRecord | null,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<Value> {
    const records = groupRecords || (record ? [record] : []);

    // Apply PARTITION BY
    let partitionedRecords = records;
    if (this.partitionBy?.length && record) {
      const partitionKeyValues: unknown[] = [];
      for (const expr of this.partitionBy) {
        const val = await expr.eval(record, ctx);
        partitionKeyValues.push(val.value);
      }
      const partitionKey = JSON.stringify(partitionKeyValues);

      const filtered: SelectRecord[] = [];
      for (const r of records) {
        const keyValues: unknown[] = [];
        for (const expr of this.partitionBy) {
          const val = await expr.eval(r, ctx);
          keyValues.push(val.value);
        }
        if (JSON.stringify(keyValues) === partitionKey) {
          filtered.push(r);
        }
      }
      partitionedRecords = filtered;
    }

    // Apply ORDER BY
    if (this.orderBy?.length) {
      partitionedRecords = [...partitionedRecords];
      // Evaluate sort values for all records
      const recordsWithSortValues = await Promise.all(
        partitionedRecords.map(async (r) => {
          const sortValues = await Promise.all(
            this.orderBy!.map(async (sort) => {
              const val = await sort.expr.eval(r, ctx);
              return val;
            })
          );
          return { record: r, sortValues };
        })
      );

      recordsWithSortValues.sort((a, b) => {
        for (let i = 0; i < this.orderBy!.length; i++) {
          const cmp = a.sortValues[i].compareTo(b.sortValues[i]);
          if (cmp !== 0) {
            return this.orderBy![i].dir === 'desc' ? -cmp : cmp;
          }
        }
        return 0;
      });

      partitionedRecords = recordsWithSortValues.map(r => r.record);
    }

    // Evaluate as aggregate
    const aggregateExpr = new AggregateExpr(
      `${this.path}.aggregate`,
      this.windowFunc as Aggregate,
      this.valueExpr
    );
    return await aggregateExpr.eval(null, ctx, partitionedRecords);
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    this.valueExpr.walk(visitor);
    if (this.partitionBy) {
      for (const expr of this.partitionBy) {
        expr.walk(visitor);
      }
    }
    if (this.orderBy) {
      for (const sort of this.orderBy) {
        sort.expr.walk(visitor);
      }
    }
  }
}

/**
 * CASE expression
 */
export class CaseExpr extends Expr {
  constructor(
    path: string,
    private readonly branches: Array<{ when: BooleanExpr; then: Expr }>,
    private readonly elseExpr?: Expr
  ) {
    super(path);
  }

  async eval(
    record: SelectRecord | null,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<Value> {
    for (const branch of this.branches) {
      if (record) {
        const condition = await branch.when.evalBoolean(record, ctx, groupRecords);
        if (condition) {
          return await branch.then.eval(record, ctx, groupRecords);
        }
      }
    }

    if (this.elseExpr) {
      return await this.elseExpr.eval(record, ctx, groupRecords);
    }

    return new Value(null);
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    for (const branch of this.branches) {
      branch.when.walk(visitor);
      branch.then.walk(visitor);
    }
    if (this.elseExpr) {
      this.elseExpr.walk(visitor);
    }
  }
}

/**
 * Semantic similarity expression (returns 0 for now)
 */
export class SemanticSimilarityExpr extends Expr {
  constructor(
    path: string,
    private readonly table: string,
    private readonly query: string
  ) {
    super(path);
  }

  async eval(
    record: SelectRecord | null,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<Value> {
    // TODO: Implement semantic similarity with embeddings
    return new Value(0);
  }

  getTable(): string {
    return this.table.toLowerCase();
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    // No children
  }
}

/**
 * =============================================================================
 * BOOLEAN EXPRESSIONS
 * =============================================================================
 */

/**
 * Comparison expression (=, <, >, <=, >=, <>, like, notLike)
 */
export class ComparisonExpr extends BooleanExpr {
  constructor(
    path: string,
    private readonly left: Expr,
    private readonly cmp: Comparison,
    private readonly right: Expr
  ) {
    super(path);
  }

  async evalBoolean(
    record: SelectRecord,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<boolean> {
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
      default:
        return false;
    }
  }

  private evalLike(left: Value, right: Value): boolean {
    const pattern = right.toString()
      .replace(/%/g, '.*')
      .replace(/_/g, '.');
    const result = new RegExp(`^${pattern}$`, 'i').test(left.toString());
    return this.cmp === 'like' ? result : !result;
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    this.left.walk(visitor);
    this.right.walk(visitor);
  }
}

/**
 * IN expression (value IN (list) or value IN (subquery))
 */
export class InExpr extends BooleanExpr {
  constructor(
    path: string,
    private readonly valueExpr: Expr,
    private readonly inValues: Expr[] | SelectExpr | SetOperationExpr
  ) {
    super(path);
  }

  async evalBoolean(
    record: SelectRecord,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<boolean> {
    const val = await this.valueExpr.eval(record, ctx, groupRecords);

    if (Array.isArray(this.inValues)) {
      // Array IN - use Value.compareTo
      for (const inExpr of this.inValues) {
        const inVal = await inExpr.eval(record, ctx, groupRecords);
        if (val.compareTo(inVal) === 0) {
          return true;
        }
      }
      return false;
    } else {
      // Subquery IN - execute the subquery and check if value is in results
      const subResult = await this.inValues.execute(ctx);
      // Extract first value from each row (subquery should return single column)
      const subValues = subResult.rows.map(r => Object.values(r)[0]);
      // Check if any subquery value matches
      return subValues.some(subVal => {
        const subValue = new Value(subVal);
        return val.compareTo(subValue) === 0;
      });
    }
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    this.valueExpr.walk(visitor);
    if (Array.isArray(this.inValues)) {
      for (const expr of this.inValues) {
        expr.walk(visitor);
      }
    } else {
      this.inValues.walk(visitor);
    }
  }
}

/**
 * BETWEEN expression (value BETWEEN low AND high)
 */
export class BetweenExpr extends BooleanExpr {
  constructor(
    path: string,
    private readonly valueExpr: Expr,
    private readonly low: Expr,
    private readonly high: Expr
  ) {
    super(path);
  }

  async evalBoolean(
    record: SelectRecord,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<boolean> {
    const val = await this.valueExpr.eval(record, ctx, groupRecords);
    const lowVal = await this.low.eval(record, ctx, groupRecords);
    const highVal = await this.high.eval(record, ctx, groupRecords);

    // Use Value.compareTo
    return val.compareTo(lowVal) >= 0 && val.compareTo(highVal) <= 0;
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    this.valueExpr.walk(visitor);
    this.low.walk(visitor);
    this.high.walk(visitor);
  }
}

/**
 * IS NULL expression
 */
export class IsNullExpr extends BooleanExpr {
  constructor(
    path: string,
    private readonly valueExpr: Expr
  ) {
    super(path);
  }

  async evalBoolean(
    record: SelectRecord,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<boolean> {
    const val = await this.valueExpr.eval(record, ctx, groupRecords);
    return val.isNull();
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    this.valueExpr.walk(visitor);
  }
}

/**
 * EXISTS expression (subquery)
 */
export class ExistsExpr extends BooleanExpr {
  constructor(
    path: string,
    private readonly subquery: SelectExpr | SetOperationExpr
  ) {
    super(path);
  }

  async evalBoolean(
    record: SelectRecord,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<boolean> {
    // Handle correlated subqueries by setting up aliases
    const savedAliases = new Map<string, DataRecord[]>();

    // Save current aliases and set up single-record context for correlation
    for (const [alias, records] of ctx.aliases) {
      savedAliases.set(alias, records);
      // Find if current SelectRecord contains this alias's DataRecord
      const dataRecord = record[alias];
      if (dataRecord) {
        ctx.aliases.set(alias, [dataRecord]);
      }
    }

    try {
      // Execute subquery
      const result = await this.subquery.execute(ctx);
      return result.rows.length > 0;
    } finally {
      // Restore original aliases
      for (const [alias, records] of savedAliases) {
        ctx.aliases.set(alias, records);
      }
    }
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    this.subquery.walk(visitor);
  }
}

/**
 * AND expression
 */
export class AndExpr extends BooleanExpr {
  constructor(
    path: string,
    private readonly operands: BooleanExpr[]
  ) {
    super(path);
  }

  async evalBoolean(
    record: SelectRecord,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<boolean> {
    for (const operand of this.operands) {
      if (!(await operand.evalBoolean(record, ctx, groupRecords))) {
        return false;
      }
    }
    return true;
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    for (const operand of this.operands) {
      operand.walk(visitor);
    }
  }
}

/**
 * OR expression
 */
export class OrExpr extends BooleanExpr {
  constructor(
    path: string,
    private readonly operands: BooleanExpr[]
  ) {
    super(path);
  }

  async evalBoolean(
    record: SelectRecord,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<boolean> {
    for (const operand of this.operands) {
      if (await operand.evalBoolean(record, ctx, groupRecords)) {
        return true;
      }
    }
    return false;
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    for (const operand of this.operands) {
      operand.walk(visitor);
    }
  }
}

/**
 * NOT expression
 */
export class NotExpr extends BooleanExpr {
  constructor(
    path: string,
    private readonly operand: BooleanExpr
  ) {
    super(path);
  }

  async evalBoolean(
    record: SelectRecord,
    ctx: QueryContext,
    groupRecords?: SelectRecord[]
  ): Promise<boolean> {
    return !(await this.operand.evalBoolean(record, ctx, groupRecords));
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    this.operand.walk(visitor);
  }
}

/**
 * =============================================================================
 * HELPER CLASSES
 * =============================================================================
 */

/**
 * Data source (table or subquery)
 */
export class DataSourceExpr {
  constructor(
    public readonly path: string,
    public readonly kind: 'table' | 'subquery',
    public readonly table?: string,
    public readonly subquery?: SelectExpr | SetOperationExpr,
    public readonly as?: string
  ) {}

  async getRecords(ctx: QueryContext): Promise<DataRecord[]> {
    if (this.kind === 'table' && this.table) {
      // Check if it's a CTE reference
      const cteRecords = ctx.ctes.get(this.table.toLowerCase());
      if (cteRecords) {
        return cteRecords;
      }

      // Load from table state
      const state = await getTableState(this.table, ctx);
      return getRecords(state);
    } else if (this.kind === 'subquery' && this.subquery) {
      // Execute subquery and convert rows to DataRecords
      const result = await this.subquery.execute(ctx);
      return result.rows.map((row, index) => ({
        id: `subquery_${index}`,
        created: Date.now(),
        updated: Date.now(),
        fields: row as Record<string, unknown>,
      }));
    }

    return [];
  }

  /**
   * Get source name (alias or table name)
   */
  getSourceName(): string {
    return this.as?.toLowerCase() || (this.kind === 'table' && this.table ? this.table.toLowerCase() : 'unknown');
  }

  walk(visitor: (expr: Expr) => boolean | void): void {
    if (this.kind === 'subquery' && this.subquery) {
      this.subquery.walk(visitor);
    }
  }

  getReferencedTables(target?: Set<string>): Set<string> {
    const tables = target || new Set<string>();
    if (this.kind === 'table' && this.table) {
      tables.add(this.table.toLowerCase());
    } else if (this.kind === 'subquery' && this.subquery) {
      this.subquery.getReferencedTables(tables);
    }
    return tables;
  }
}

/**
 * JOIN operation
 */
export class JoinExpr {
  constructor(
    public readonly path: string,
    public readonly source: DataSourceExpr,
    public readonly type: 'inner' | 'left' | 'right' | 'full',
    public readonly on: BooleanExpr[]
  ) {}

  async apply(leftSelectRecords: SelectRecord[], ctx: QueryContext): Promise<SelectRecord[]> {
    const rightRecords = await this.source.getRecords(ctx);
    const rightSourceName = this.source.getSourceName();

    // Store right records in aliases if needed
    if (this.source.as) {
      ctx.aliases.set(this.source.as.toLowerCase(), rightRecords);
    } else if (this.source.kind === 'table' && this.source.table) {
      ctx.aliases.set(this.source.table.toLowerCase(), rightRecords);
    }

    const result: SelectRecord[] = [];

    switch (this.type) {
      case 'inner':
        for (const leftSR of leftSelectRecords) {
          for (const right of rightRecords) {
            const combined = combineSelectRecords(leftSR, createSelectRecord(rightSourceName, right));
            if (await this.evaluateOnConditions(combined, ctx)) {
              result.push(combined);
            }
          }
        }
        break;

      case 'left':
        for (const leftSR of leftSelectRecords) {
          let matched = false;
          for (const right of rightRecords) {
            const combined = combineSelectRecords(leftSR, createSelectRecord(rightSourceName, right));
            if (await this.evaluateOnConditions(combined, ctx)) {
              result.push(combined);
              matched = true;
            }
          }
          if (!matched) {
            result.push(leftSR);
          }
        }
        break;

      case 'right':
        for (const right of rightRecords) {
          let matched = false;
          for (const leftSR of leftSelectRecords) {
            const combined = combineSelectRecords(leftSR, createSelectRecord(rightSourceName, right));
            if (await this.evaluateOnConditions(combined, ctx)) {
              result.push(combined);
              matched = true;
            }
          }
          if (!matched) {
            result.push(createSelectRecord(rightSourceName, right));
          }
        }
        break;

      case 'full':
        const rightMatched = new Set<string>();
        for (const leftSR of leftSelectRecords) {
          let matched = false;
          for (const right of rightRecords) {
            const combined = combineSelectRecords(leftSR, createSelectRecord(rightSourceName, right));
            if (await this.evaluateOnConditions(combined, ctx)) {
              result.push(combined);
              matched = true;
              rightMatched.add(right.id);
            }
          }
          if (!matched) {
            result.push(leftSR);
          }
        }
        // Add unmatched right records
        for (const right of rightRecords) {
          if (!rightMatched.has(right.id)) {
            result.push(createSelectRecord(rightSourceName, right));
          }
        }
        break;
    }

    return result;
  }

  private async evaluateOnConditions(selectRecord: SelectRecord, ctx: QueryContext): Promise<boolean> {
    for (const cond of this.on) {
      if (!(await cond.evalBoolean(selectRecord, ctx))) {
        return false;
      }
    }
    return true;
  }

  walk(visitor: (expr: Expr) => boolean | void): void {
    this.source.walk(visitor);
    for (const cond of this.on) {
      cond.walk(visitor);
    }
  }

  getReferencedTables(target?: Set<string>): Set<string> {
    const tables = target || new Set<string>();
    this.source.getReferencedTables(tables);
    for (const cond of this.on) {
      cond.getReferencedTables(tables);
    }
    return tables;
  }
}

/**
 * Combine two SelectRecords for join operations
 * Each SelectRecord maps source names to DataRecords
 */
function combineSelectRecords(left: SelectRecord, right: SelectRecord): SelectRecord {
  return { ...left, ...right };
}

/**
 * Create a SelectRecord from a single DataRecord with a source name
 */
function createSelectRecord(sourceName: string, record: DataRecord): SelectRecord {
  return { [sourceName]: record };
}

/**
 * Sort specification
 */
export class SortExpr {
  constructor(
    public readonly path: string,
    public readonly expr: Expr,
    public readonly dir: 'asc' | 'desc'
  ) {}

  walk(visitor: (expr: Expr) => boolean | void): void {
    this.expr.walk(visitor);
  }

  getReferencedTables(target?: Set<string>): Set<string> {
    return this.expr.getReferencedTables(target);
  }
}

/**
 * =============================================================================
 * TABLE STATE MANAGEMENT (from dba-query.ts)
 * =============================================================================
 */

async function getTableState(tableName: string, ctx: QueryContext): Promise<TableState> {
  const normalizedTableName = tableName.toLowerCase();
  let state = ctx.tableStates.get(normalizedTableName);
  if (!state) {
    let manager = ctx.dataManagers.get(normalizedTableName);
    if (!manager) {
      manager = ctx.getManager(normalizedTableName);
      await manager.load();
      ctx.dataManagers.set(normalizedTableName, manager);
    }

    const original = manager.getAll();
    state = {
      original,
      current: [...original],
      deleted: new Set(),
      updated: new Map(),
      inserted: new Map(),
      version: computeTableVersion(original),
    };
    ctx.tableStates.set(normalizedTableName, state);
  }
  return state;
}

function computeTableVersion(records: DataRecord[]): string {
  const data = records.map(r => `${r.id}:${r.updated}`).sort().join('|');
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function getRecords(state: TableState): DataRecord[] {
  return state.current;
}

function addInsert(state: TableState, id: string, fields: Record<string, unknown>): DataRecord {
  const now = Date.now();
  const record: DataRecord = {
    id,
    created: now,
    updated: now,
    fields,
  };

  if (state.deleted.has(id)) {
    state.deleted.delete(id);
  }

  state.current.push(record);
  state.inserted.set(id, fields);

  return record;
}

function addUpdate(state: TableState, id: string, fields: Record<string, unknown>): void {
  const record = state.current.find(r => r.id === id);
  if (!record) return;

  Object.assign(record.fields, fields);
  record.updated = Date.now();

  if (state.inserted.has(id)) {
    const existingFields = state.inserted.get(id);
    if (existingFields) {
      Object.assign(existingFields, fields);
    }
  } else {
    const existing = state.updated.get(id);
    if (existing) {
      Object.assign(existing, fields);
    } else {
      state.updated.set(id, { ...fields });
    }
  }
}

function addDelete(state: TableState, id: string): void {
  state.current = state.current.filter(r => r.id !== id);

  if (state.inserted.has(id)) {
    state.inserted.delete(id);
  } else {
    state.updated.delete(id);
    state.deleted.add(id);
  }
}

/**
 * =============================================================================
 * STATEMENT EXPRESSIONS
 * =============================================================================
 */

/**
 * SELECT statement
 */
export class SelectExpr extends Expr {
  constructor(
    path: string,
    private readonly distinct: boolean,
    private readonly values: Array<{ alias: string; expr: Expr }>,
    private readonly from?: DataSourceExpr,
    private readonly joins?: JoinExpr[],
    private readonly where?: BooleanExpr[],
    private readonly groupBy?: Expr[],
    private readonly having?: BooleanExpr[],
    private readonly orderBy?: SortExpr[],
    private readonly offset?: number,
    private readonly limit?: number
  ) {
    super(path);
  }


  async eval(record: SelectRecord | null, ctx: QueryContext, groupRecords?: SelectRecord[]): Promise<Value> {
    // SELECT as scalar subquery - return first value from first row
    const result = await this.execute(ctx);
    if (result.rows.length === 0) return new Value(null);
    const firstRow = result.rows[0];
    const keys = Object.keys(firstRow);
    return new Value(keys.length > 0 ? firstRow[keys[0]] : null);
  }

  async execute(ctx: QueryContext): Promise<QueryResult> {
    // 1. Get records from FROM clause and convert to SelectRecords
    let selectRecords: SelectRecord[] = [];
    if (this.from) {
      const dataRecords = await this.from.getRecords(ctx);
      const sourceName = this.from.getSourceName();

      // Convert DataRecords to SelectRecords
      selectRecords = dataRecords.map(dr => createSelectRecord(sourceName, dr));

      // Set up alias for FROM
      if (this.from.as) {
        ctx.aliases.set(this.from.as.toLowerCase(), dataRecords);
      } else if (this.from.kind === 'table' && this.from.table) {
        ctx.aliases.set(this.from.table.toLowerCase(), dataRecords);
      }
    }

    // 2. Apply JOINs
    if (this.joins) {
      for (const join of this.joins) {
        selectRecords = await join.apply(selectRecords, ctx);
      }
    }

    // 3. Apply WHERE
    if (this.where) {
      const filtered: SelectRecord[] = [];
      for (const selectRecord of selectRecords) {
        let matches = true;
        for (const cond of this.where) {
          if (!(await cond.evalBoolean(selectRecord, ctx))) {
            matches = false;
            break;
          }
        }
        if (matches) {
          filtered.push(selectRecord);
        }
      }
      selectRecords = filtered;
    }

    // 4. Apply GROUP BY and compute values
    let rows: Record<string, unknown>[];

    if (this.groupBy?.length) {
      // Group records
      const groups = await this.groupRecords(selectRecords, this.groupBy, ctx);
      const rowsWithGroups: Array<{ row: Record<string, unknown>; groupRecs: SelectRecord[] }> = [];

      for (const [, groupRecs] of groups) {
        const row: Record<string, unknown> = {};
        for (const { alias, expr } of this.values) {
          const evaluatedValue = await expr.eval(groupRecs[0], ctx, groupRecs);
          Expr.handleWildcardExpansion(row, alias, evaluatedValue, expr);
        }
        rowsWithGroups.push({ row, groupRecs });
      }

      // Apply HAVING clause
      if (this.having?.length) {
        const filteredRowsWithGroups: Array<{ row: Record<string, unknown>; groupRecs: SelectRecord[] }> = [];
        for (const { row, groupRecs } of rowsWithGroups) {
          let matches = true;
          for (const cond of this.having) {
            if (!(await cond.evalBoolean(groupRecs[0], ctx, groupRecs))) {
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
      const hasAggregates = this.values.some(({ expr }) => expr.containsAggregate());

      if (hasAggregates && selectRecords.length > 0) {
        // Single aggregate result
        const row: Record<string, unknown> = {};
        for (const { alias, expr } of this.values) {
          const evaluatedValue = await expr.eval(selectRecords[0], ctx, selectRecords);
          Expr.handleWildcardExpansion(row, alias, evaluatedValue, expr);
        }
        rows = [row];
      } else if (selectRecords.length === 0 && this.values.length > 0) {
        // No records but values requested
        if (hasAggregates) {
          const row: Record<string, unknown> = {};
          for (const { alias, expr } of this.values) {
            const evaluatedValue = await expr.eval(null, ctx, []);
            Expr.handleWildcardExpansion(row, alias, evaluatedValue, expr);
          }
          rows = [row];
        } else {
          rows = [];
        }
      } else {
        rows = [];
        for (const selectRecord of selectRecords) {
          const row: Record<string, unknown> = {};
          for (const { alias, expr } of this.values) {
            const evaluatedValue = await expr.eval(selectRecord, ctx, selectRecords);
            Expr.handleWildcardExpansion(row, alias, evaluatedValue, expr);
          }
          rows.push(row);
        }
      }
    }

    // 5. Apply DISTINCT
    if (this.distinct) {
      const seen = new Set<string>();
      rows = rows.filter(row => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // 6. Apply ORDER BY
    if (this.orderBy?.length) {
      rows = await this.sortRows(rows, this.orderBy, ctx);
    }

    // 7. Apply OFFSET and LIMIT
    if (this.offset !== undefined && this.offset !== null) {
      rows = rows.slice(this.offset);
    }
    if (this.limit !== undefined && this.limit !== null) {
      rows = rows.slice(0, this.limit);
    }

    return { rows, canCommit: true };
  }

  private async groupRecords(
    selectRecords: SelectRecord[],
    groupBy: Expr[],
    ctx: QueryContext
  ): Promise<Map<string, SelectRecord[]>> {
    const groups = new Map<string, SelectRecord[]>();

    for (const selectRecord of selectRecords) {
      const keyValues: unknown[] = [];
      for (const expr of groupBy) {
        const val = await expr.eval(selectRecord, ctx);
        keyValues.push(val.value);
      }
      const key = JSON.stringify(keyValues);

      const group = groups.get(key) || [];
      group.push(selectRecord);
      groups.set(key, group);
    }

    return groups;
  }

  private async sortRows(
    rows: Record<string, unknown>[],
    orderBy: SortExpr[],
    ctx: QueryContext
  ): Promise<Record<string, unknown>[]> {
    // Create temp select records and evaluate sort values
    const rowsWithValues: Array<{
      row: Record<string, unknown>;
      sortValues: Value[];
    }> = [];

    for (const row of rows) {
      // Create a temp DataRecord and wrap in SelectRecord
      const tempDataRecord: DataRecord = {
        id: '',
        created: 0,
        updated: 0,
        fields: row as Record<string, unknown>,
      };
      const tempSelectRecord: SelectRecord = { __temp__: tempDataRecord };

      const sortValues: Value[] = [];
      for (const sort of orderBy) {
        const val = await sort.expr.eval(tempSelectRecord, ctx);
        sortValues.push(val);
      }
      rowsWithValues.push({ row, sortValues });
    }

    // Sort using pre-evaluated values
    rowsWithValues.sort((a, b) => {
      for (let i = 0; i < orderBy.length; i++) {
        const cmp = a.sortValues[i].compareTo(b.sortValues[i]);
        if (cmp !== 0) {
          return orderBy[i].dir === 'desc' ? -cmp : cmp;
        }
      }
      return 0;
    });

    return rowsWithValues.map(r => r.row);
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    for (const { expr } of this.values) {
      expr.walk(visitor);
    }
    if (this.from) {
      this.from.walk(visitor);
    }
    if (this.joins) {
      for (const join of this.joins) {
        join.walk(visitor);
      }
    }
    if (this.where) {
      for (const w of this.where) {
        w.walk(visitor);
      }
    }
    if (this.groupBy) {
      for (const g of this.groupBy) {
        g.walk(visitor);
      }
    }
    if (this.having) {
      for (const h of this.having) {
        h.walk(visitor);
      }
    }
    if (this.orderBy) {
      for (const o of this.orderBy) {
        o.walk(visitor);
      }
    }
  }
}

/**
 * INSERT statement
 */
export class InsertExpr extends Expr {
  constructor(
    path: string,
    private readonly table: string,
    private readonly columns: string[],
    private readonly values?: Expr[],
    private readonly select?: SelectExpr | SetOperationExpr,
    private readonly returning?: Array<{ alias: string; expr: Expr }>,
    private readonly onConflict?: {
      columns: string[];
      doNothing?: boolean;
      update?: Array<{ column: string; expr: Expr }>;
    }
  ) {
    super(path);
  }

  async eval(record: SelectRecord | null, ctx: QueryContext, groupRecords?: SelectRecord[]): Promise<Value> {
    const result = await this.execute(ctx);
    return new Value(result.affectedCount);
  }

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

    const state = await getTableState(this.table, ctx);
    const insertResult: QueryResultType = { type: this.table, ids: [] };
    const insertedRecords: DataRecord[] = [];

    // Validate column count
    if (this.values && this.values.length !== this.columns.length) {
      ctx.validationErrors.push({
        path: `${this.path}.values`,
        message: `Column count (${this.columns.length}) != value count (${this.values.length})`,
        metadata: { columns: this.columns, valueCount: this.values.length }
      });
      return { rows: [], canCommit: false };
    }

    // Get values to insert
    let valuesToInsert: Array<{ fields: Record<string, unknown>; values: Value[] }>;

    if (this.values?.length) {
      // Direct values - evaluate and validate
      const valueObjs: Value[] = [];
      const record: Record<string, unknown> = {};

      for (let i = 0; i < this.columns.length; i++) {
        const column = this.columns[i];
        const normalizedColumn = column.toLowerCase();
        const value = await this.values[i].eval(null, ctx);
        valueObjs.push(value);

        // Find field definition
        const field = typeDef.fields.find(f => f.name === normalizedColumn);
        if (!field) {
          ctx.validationErrors.push({
            path: `${this.path}.columns[${i}]`,
            message: `Column '${normalizedColumn}' does not exist on table '${tableName}'`,
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

        record[normalizedColumn] = value.value;
      }
      valuesToInsert = [{ fields: record, values: valueObjs }];
    } else if (this.select) {
      // Values from SELECT
      const selectResult = await this.select.execute(ctx);
      valuesToInsert = selectResult.rows.map(row => {
        const record: Record<string, unknown> = {};
        const valueObjs: Value[] = [];

        for (let i = 0; i < this.columns.length; i++) {
          const column = this.columns[i];
          const normalizedColumn = column.toLowerCase();
          const selectAlias = Object.keys(row)[i];
          const rawValue = row[selectAlias];
          const value = new Value(rawValue);
          valueObjs.push(value);

          // Find field and validate
          const field = typeDef.fields.find(f => f.name === normalizedColumn);
          if (field) {
            const assignability = value.isAssignableTo(field, ctx);
            if (!assignability.valid) {
              const error = assignability.error!;
              error.path = `${this.path}.select.row.${normalizedColumn}`;
              ctx.validationErrors.push(error);
            }
          }

          record[normalizedColumn] = rawValue;
        }
        return { fields: record, values: valueObjs };
      });
    } else {
      throw new Error('INSERT must have either values or select');
    }

    // Insert records
    for (const { fields } of valuesToInsert) {
      if (this.onConflict) {
        // Check for conflict
        const conflictKey = JSON.stringify(
          this.onConflict.columns.map(col => fields[col.toLowerCase()])
        );
        const existing = getRecords(state).find(record => {
          const existingKey = JSON.stringify(
            this.onConflict!.columns.map(col => record.fields[col.toLowerCase()])
          );
          return existingKey === conflictKey;
        });

        if (existing) {
          if (this.onConflict.doNothing) {
            continue;
          } else if (this.onConflict.update?.length) {
            // Update on conflict - validate update values
            const updates: Record<string, unknown> = {};
            for (const { column, expr } of this.onConflict.update) {
              const normalizedColumn = column.toLowerCase();
              const selectExisting = createSelectRecord(tableName, existing);
              const value = await expr.eval(selectExisting, ctx);

              // Validate update value
              const field = typeDef.fields.find(f => f.name === normalizedColumn);
              if (field) {
                const assignability = value.isAssignableTo(field, ctx);
                if (!assignability.valid) {
                  const error = assignability.error!;
                  error.path = `${this.path}.onConflict.update.${normalizedColumn}`;
                  ctx.validationErrors.push(error);
                  continue;
                }
              }

              updates[normalizedColumn] = value.value;
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
    if (this.returning?.length) {
      for (const record of insertedRecords) {
        // Wrap DataRecord in SelectRecord for evaluation
        const selectRecord = createSelectRecord(tableName, record);
        const row: Record<string, unknown> = {};
        for (const { alias, expr } of this.returning) {
          const evaluatedValue = await expr.eval(selectRecord, ctx);
          Expr.handleWildcardExpansion(row, alias, evaluatedValue, expr);
        }
        rows.push(row);
      }
    }

    return {
      rows,
      affectedCount: insertResult.ids.length,
      inserted: insertResult.ids.length ? [insertResult] : undefined,
      canCommit: true,
    };
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    if (this.values) {
      for (const expr of this.values) {
        expr.walk(visitor);
      }
    }
    if (this.select) {
      this.select.walk(visitor);
    }
    if (this.returning) {
      for (const { expr } of this.returning) {
        expr.walk(visitor);
      }
    }
    if (this.onConflict?.update) {
      for (const { expr } of this.onConflict.update) {
        expr.walk(visitor);
      }
    }
  }

  // Override getReferencedTables to include the target table
  getReferencedTables(target?: Set<string>): Set<string> {
    const tables = super.getReferencedTables(target);
    tables.add(this.table.toLowerCase());
    return tables;
  }
}

/**
 * UPDATE statement
 */
export class UpdateExpr extends Expr {
  constructor(
    path: string,
    private readonly table: string,
    private readonly set: Array<{ column: string; expr: Expr }>,
    private readonly as?: string,
    private readonly from?: DataSourceExpr,
    private readonly joins?: JoinExpr[],
    private readonly where?: BooleanExpr[],
    private readonly returning?: Array<{ alias: string; expr: Expr }>
  ) {
    super(path);
  }

  async eval(record: SelectRecord | null, ctx: QueryContext, groupRecords?: SelectRecord[]): Promise<Value> {
    const result = await this.execute(ctx);
    return new Value(result.affectedCount);
  }

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

    const state = await getTableState(this.table, ctx);
    const dataRecords = getRecords(state);
    const sourceAlias = this.as?.toLowerCase() || tableName;
    let selectRecords: SelectRecord[] = dataRecords.map(dr => createSelectRecord(sourceAlias, dr));

    // Set up alias if specified
    if (this.as) {
      ctx.aliases.set(this.as.toLowerCase(), dataRecords);
    } else {
      ctx.aliases.set(tableName, dataRecords);
    }

    // Apply FROM clause
    if (this.from) {
      const fromRecords = await this.from.getRecords(ctx);
      if (this.from.as) {
        ctx.aliases.set(this.from.as.toLowerCase(), fromRecords);
      } else if (this.from.kind === 'table' && this.from.table) {
        ctx.aliases.set(this.from.table.toLowerCase(), fromRecords);
      }
    }

    // Apply JOINs
    if (this.joins) {
      for (const join of this.joins) {
        selectRecords = await join.apply(selectRecords, ctx);
      }
    }

    // Apply WHERE
    if (this.where) {
      const filtered: SelectRecord[] = [];
      for (const selectRecord of selectRecords) {
        let matches = true;
        for (const cond of this.where) {
          if (!(await cond.evalBoolean(selectRecord, ctx))) {
            matches = false;
            break;
          }
        }
        if (matches) {
          filtered.push(selectRecord);
        }
      }
      selectRecords = filtered;
    }

    const updateResult: QueryResultType = { type: this.table, ids: [] };
    const updatedRecords: DataRecord[] = [];

    // Update matching records
    for (const selectRecord of selectRecords) {
      // Get the actual DataRecord for the target table
      const record = selectRecord[sourceAlias];
      if (!record) continue;

      const updates: Record<string, unknown> = {};
      for (const { column, expr } of this.set) {
        const normalizedColumn = column.toLowerCase();
        const value = await expr.eval(selectRecord, ctx);

        // Find field and validate
        const field = typeDef.fields.find(f => f.name === normalizedColumn);
        if (!field) {
          ctx.validationErrors.push({
            path: `${this.path}.set.${normalizedColumn}`,
            message: `Column '${normalizedColumn}' does not exist on table '${tableName}'`,
            suggestion: `Available columns: ${typeDef.fields.map(f => f.name).join(', ')}`
          });
          continue;
        }

        // VALIDATE using Value.isAssignableTo
        const assignability = value.isAssignableTo(field, ctx);
        if (!assignability.valid) {
          const error = assignability.error!;
          error.path = `${this.path}.set.${normalizedColumn}`;
          ctx.validationErrors.push(error);
          continue;
        }

        updates[normalizedColumn] = value.value;
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
    if (this.returning?.length) {
      for (const record of updatedRecords) {
        // Wrap DataRecord in SelectRecord for evaluation
        const selectRecord = createSelectRecord(tableName, record);
        const row: Record<string, unknown> = {};
        for (const { alias, expr } of this.returning) {
          const evaluatedValue = await expr.eval(selectRecord, ctx);
          Expr.handleWildcardExpansion(row, alias, evaluatedValue, expr);
        }
        rows.push(row);
      }
    }

    return {
      rows,
      affectedCount: updateResult.ids.length,
      updated: updateResult.ids.length ? [updateResult] : undefined,
      canCommit: true,
    };
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    for (const { expr } of this.set) {
      expr.walk(visitor);
    }
    if (this.from) {
      this.from.walk(visitor);
    }
    if (this.joins) {
      for (const join of this.joins) {
        join.walk(visitor);
      }
    }
    if (this.where) {
      for (const w of this.where) {
        w.walk(visitor);
      }
    }
    if (this.returning) {
      for (const { expr } of this.returning) {
        expr.walk(visitor);
      }
    }
  }

  getReferencedTables(target?: Set<string>): Set<string> {
    const tables = super.getReferencedTables(target);
    tables.add(this.table.toLowerCase());
    return tables;
  }
}

/**
 * DELETE statement
 */
export class DeleteExpr extends Expr {
  constructor(
    path: string,
    private readonly table: string,
    private readonly as?: string,
    private readonly joins?: JoinExpr[],
    private readonly where?: BooleanExpr[],
    private readonly returning?: Array<{ alias: string; expr: Expr }>
  ) {
    super(path);
  }

  async eval(record: SelectRecord | null, ctx: QueryContext, groupRecords?: SelectRecord[]): Promise<Value> {
    const result = await this.execute(ctx);
    return new Value(result.affectedCount);
  }

  async execute(ctx: QueryContext): Promise<QueryResult> {
    const state = await getTableState(this.table, ctx);
    const dataRecords = getRecords(state);
    const tableName = this.table.toLowerCase();
    const sourceAlias = this.as?.toLowerCase() || tableName;
    let selectRecords: SelectRecord[] = dataRecords.map(dr => createSelectRecord(sourceAlias, dr));

    // Set up alias if specified
    if (this.as) {
      ctx.aliases.set(this.as.toLowerCase(), dataRecords);
    } else {
      ctx.aliases.set(tableName, dataRecords);
    }

    // Apply JOINs
    if (this.joins) {
      for (const join of this.joins) {
        selectRecords = await join.apply(selectRecords, ctx);
      }
    }

    // Apply WHERE
    if (this.where) {
      const filtered: SelectRecord[] = [];
      for (const selectRecord of selectRecords) {
        let matches = true;
        for (const cond of this.where) {
          if (!(await cond.evalBoolean(selectRecord, ctx))) {
            matches = false;
            break;
          }
        }
        if (matches) {
          filtered.push(selectRecord);
        }
      }
      selectRecords = filtered;
    }

    // Collect records for RETURNING before deletion
    const recordsToDelete = selectRecords.map(sr => sr[sourceAlias]).filter((r): r is DataRecord => r !== undefined);
    const deleteResult: QueryResultType = { type: this.table, ids: [] };

    // Handle RETURNING before deletion
    let rows: Record<string, unknown>[] = [];
    if (this.returning?.length) {
      for (const selectRecord of selectRecords) {
        const row: Record<string, unknown> = {};
        for (const { alias, expr } of this.returning) {
          const evaluatedValue = await expr.eval(selectRecord, ctx);
          Expr.handleWildcardExpansion(row, alias, evaluatedValue, expr);
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
      canCommit: true,
    };
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    if (this.joins) {
      for (const join of this.joins) {
        join.walk(visitor);
      }
    }
    if (this.where) {
      for (const w of this.where) {
        w.walk(visitor);
      }
    }
    if (this.returning) {
      for (const { expr } of this.returning) {
        expr.walk(visitor);
      }
    }
  }

  getReferencedTables(target?: Set<string>): Set<string> {
    const tables = super.getReferencedTables(target);
    tables.add(this.table.toLowerCase());
    return tables;
  }
}

/**
 * Set operation (UNION, INTERSECT, EXCEPT)
 */
export class SetOperationExpr extends Expr {
  constructor(
    path: string,
    private readonly kind: 'union' | 'intersect' | 'except',
    private readonly left: SelectExpr,
    private readonly right: SelectExpr,
    private readonly all: boolean
  ) {
    super(path);
  }

  async eval(record: SelectRecord | null, ctx: QueryContext, groupRecords?: SelectRecord[]): Promise<Value> {
    const result = await this.execute(ctx);
    return new Value(result.rows.length);
  }

  async execute(ctx: QueryContext): Promise<QueryResult> {
    const leftResult = await this.left.execute(ctx);
    const rightResult = await this.right.execute(ctx);

    let rows: Record<string, unknown>[];

    switch (this.kind) {
      case 'union':
        rows = [...leftResult.rows, ...rightResult.rows];
        break;
      case 'intersect':
        rows = leftResult.rows.filter(leftRow =>
          rightResult.rows.some(
            rightRow => JSON.stringify(leftRow) === JSON.stringify(rightRow)
          )
        );
        break;
      case 'except':
        rows = leftResult.rows.filter(
          leftRow =>
            !rightResult.rows.some(
              rightRow => JSON.stringify(leftRow) === JSON.stringify(rightRow)
            )
        );
        break;
      default:
        throw new Error(`Unknown set operation: ${this.kind}`);
    }

    // Remove duplicates unless ALL is specified
    if (!this.all) {
      const seen = new Set<string>();
      rows = rows.filter(row => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    return { rows, canCommit: true };
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    this.left.walk(visitor);
    this.right.walk(visitor);
  }
}

/**
 * CTE statement (WITH clause)
 */
export class CTEStatementExpr extends Expr {
  constructor(
    path: string,
    private readonly ctes: Array<{
      name: string;
      stmt: SelectExpr | InsertExpr | UpdateExpr | DeleteExpr | SetOperationExpr;
      recursive?: SelectExpr;
    }>,
    private readonly final: Expr
  ) {
    super(path);
  }

  async eval(record: SelectRecord | null, ctx: QueryContext, groupRecords?: SelectRecord[]): Promise<Value> {
    const result = await this.execute(ctx);
    return new Value(result.rows.length);
  }

  async execute(ctx: QueryContext): Promise<QueryResult> {
    // Execute each CTE in order and store results
    for (const cte of this.ctes) {
      const normalizedName = cte.name.toLowerCase();

      if (cte.recursive) {
        // Recursive CTE
        const initialResult = await cte.stmt.execute(ctx);
        let allRecords: DataRecord[] = initialResult.rows.map((row, index) => ({
          id: `cte_${normalizedName}_${index}`,
          created: Date.now(),
          updated: Date.now(),
          fields: row as Record<string, unknown>,
        }));

        // Store initial results for recursive reference
        ctx.ctes.set(normalizedName, allRecords);

        // Execute recursive part until no new rows
        let iteration = 0;
        const maxIterations = 1000; // Safety limit
        let newRecords = allRecords;

        while (newRecords.length > 0 && iteration < maxIterations) {
          const recursiveResult = await cte.recursive.execute(ctx);
          newRecords = recursiveResult.rows.map((row, index) => ({
            id: `cte_${normalizedName}_recursive_${iteration}_${index}`,
            created: Date.now(),
            updated: Date.now(),
            fields: row,
          }));

          if (newRecords.length > 0) {
            allRecords = [...allRecords, ...newRecords];
            ctx.ctes.set(normalizedName, allRecords);
          }
          iteration++;
        }
      } else {
        // Non-recursive CTE
        const result = await cte.stmt.execute(ctx);
        const records: DataRecord[] = result.rows.map((row, index) => ({
          id: `cte_${normalizedName}_${index}`,
          created: Date.now(),
          updated: Date.now(),
          fields: row as Record<string, unknown>,
        }));
        ctx.ctes.set(normalizedName, records);
      }
    }

    // Execute the final statement
    if (this.final instanceof SelectExpr) {
      return await this.final.execute(ctx);
    } else if (this.final instanceof InsertExpr) {
      return await this.final.execute(ctx);
    } else if (this.final instanceof UpdateExpr) {
      return await this.final.execute(ctx);
    } else if (this.final instanceof DeleteExpr) {
      return await this.final.execute(ctx);
    } else if (this.final instanceof SetOperationExpr) {
      return await this.final.execute(ctx);
    } else {
      throw new Error('Invalid final statement in CTE');
    }
  }

  protected walkChildren(visitor: (expr: Expr) => boolean | void): void {
    for (const cte of this.ctes) {
      cte.stmt.walk(visitor);
      if (cte.recursive) {
        cte.recursive.walk(visitor);
      }
    }
    this.final.walk(visitor);
  }
}

// ============================================================================
// Factory Functions - Convert Discriminated Unions to Class Instances
// ============================================================================

/**
 * Helper to determine if a value is a SourceColumn (no 'kind' property)
 */
function isSourceColumn(value: unknown): value is SourceColumnDBA {
  return (
    typeof value === 'object' &&
    value !== null &&
    'source' in value &&
    'column' in value &&
    !('kind' in value)
  );
}

/**
 * Helper to determine if a value is a primitive constant
 */
function isConstant(value: unknown): value is Constant {
  return (
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    value === null
  );
}

/**
 * Convert a Value discriminated union to an Expr class instance
 */
export function createExprFromValue(value: ValueDBA, path: string): Expr {
  // Handle primitives (constants)
  if (isConstant(value)) {
    return new ConstantExpr(path, value);
  }

  // Handle SourceColumn (no 'kind' property)
  if (isSourceColumn(value)) {
    return new SourceColumnExpr(path, value.source, value.column);
  }

  // Handle complex types with 'kind'
  if (typeof value === 'object' && value !== null && 'kind' in value) {
    switch (value.kind) {
      case 'binary':
        return new BinaryExpr(
          path,
          createExprFromValue(value.left, `${path}.left`),
          value.op,
          createExprFromValue(value.right, `${path}.right`)
        );

      case 'unary':
        return new UnaryExpr(
          path,
          value.unary,
          createExprFromValue(value.value, `${path}.value`)
        );

      case 'aggregate':
        const operand = value.value === '*'
          ? '*'
          : createExprFromValue(value.value, `${path}.value`);
        return new AggregateExpr(path, value.aggregate, operand);

      case 'function':
        return new FunctionCallExpr(
          path,
          value.function,
          value.args.map((arg, i) => createExprFromValue(arg, `${path}.args[${i}]`))
        );

      case 'window':
        return new WindowExpr(
          path,
          value.function,
          createExprFromValue(value.value, `${path}.value`),
          value.partitionBy?.map((p, i) => createExprFromValue(p, `${path}.partitionBy[${i}]`)),
          value.orderBy?.map((s, i) => createSortExpr(s, `${path}.orderBy[${i}]`))
        );

      case 'case':
        return new CaseExpr(
          path,
          value.case.map((c, i) => ({
            when: createBooleanExprFromValue(c.when, `${path}.case[${i}].when`),
            then: createExprFromValue(c.then, `${path}.case[${i}].then`)
          })),
          value.else ? createExprFromValue(value.else, `${path}.else`) : undefined
        );

      case 'semanticSimilarity':
        return new SemanticSimilarityExpr(path, value.table, value.query);

      case 'select':
        return createSelectExpr(value, path);

      // Boolean expressions used as values
      case 'comparison':
      case 'in':
      case 'between':
      case 'isNull':
      case 'exists':
      case 'and':
      case 'or':
      case 'not':
        return createBooleanExprFromValue(value, path);

      default:
        throw new Error(`Unknown value kind at path: ${path}`);
    }
  }

  throw new Error(`Unknown value type at path: ${path}`);
}

/**
 * Convert a BooleanValue discriminated union to a BooleanExpr class instance
 */
export function createBooleanExprFromValue(value: BooleanValueDBA, path: string): BooleanExpr {
  if (typeof value === 'object' && value !== null && 'kind' in value) {
    switch (value.kind) {
      case 'comparison':
        return new ComparisonExpr(
          path,
          createExprFromValue(value.left, `${path}.left`),
          value.cmp,
          createExprFromValue(value.right, `${path}.right`)
        );

      case 'in':
        if (Array.isArray(value.in)) {
          return new InExpr(
            path,
            createExprFromValue(value.value, `${path}.value`),
            value.in.map((v, i) => createExprFromValue(v, `${path}.in[${i}]`))
          );
        } else {
          // Subquery
          const subquery = value.in.kind === 'select'
            ? createSelectExpr(value.in, `${path}.in`)
            : createSetOperationExpr(value.in, `${path}.in`);
          return new InExpr(path, createExprFromValue(value.value, `${path}.value`), subquery);
        }

      case 'between':
        return new BetweenExpr(
          path,
          createExprFromValue(value.value, `${path}.value`),
          createExprFromValue(value.between[0], `${path}.between[0]`),
          createExprFromValue(value.between[1], `${path}.between[1]`)
        );

      case 'isNull':
        return new IsNullExpr(
          path,
          createExprFromValue(value.isNull, `${path}.isNull`)
        );

      case 'exists':
        const existsSubquery = value.exists.kind === 'select'
          ? createSelectExpr(value.exists, `${path}.exists`)
          : createSetOperationExpr(value.exists, `${path}.exists`);
        return new ExistsExpr(path, existsSubquery);

      case 'and':
        return new AndExpr(
          path,
          value.and.map((b, i) => createBooleanExprFromValue(b, `${path}.and[${i}]`))
        );

      case 'or':
        return new OrExpr(
          path,
          value.or.map((b, i) => createBooleanExprFromValue(b, `${path}.or[${i}]`))
        );

      case 'not':
        return new NotExpr(
          path,
          createBooleanExprFromValue(value.not, `${path}.not`)
        );

      default:
        throw new Error(`Unknown boolean value kind at path: ${path}`);
    }
  }

  throw new Error(`Invalid boolean value at path: ${path}`);
}

/**
 * Create a SortExpr from a Sort discriminated union
 */
function createSortExpr(sort: SortDBA, path: string): SortExpr {
  return new SortExpr(
    path,
    createExprFromValue(sort.value, `${path}.value`),
    sort.dir
  );
}

/**
 * Create a DataSourceExpr from a DataSource discriminated union
 */
function createDataSourceExpr(source: DataSourceDBA, path: string): DataSourceExpr {
  if (source.kind === 'table') {
    return new DataSourceExpr(
      path,
      'table',
      source.table.toLowerCase(),
      undefined,
      source.as?.toLowerCase()
    );
  } else {
    // Subquery
    const subquery = source.subquery.kind === 'select'
      ? createSelectExpr(source.subquery, `${path}.subquery`)
      : createSetOperationExpr(source.subquery, `${path}.subquery`);
    return new DataSourceExpr(
      path,
      'subquery',
      undefined,
      subquery,
      source.as.toLowerCase()
    );
  }
}

/**
 * Create a JoinExpr from a Join discriminated union
 */
function createJoinExpr(join: JoinDBA, path: string): JoinExpr {
  return new JoinExpr(
    path,
    createDataSourceExpr(join.source, `${path}.source`),
    join.type,
    join.on.map((b, i) => createBooleanExprFromValue(b, `${path}.on[${i}]`))
  );
}

/**
 * Create a SelectExpr from a Select statement
 */
export function createSelectExpr(stmt: SelectDBA, path: string): SelectExpr {
  return new SelectExpr(
    path,
    stmt.distinct ?? false,
    stmt.values.map((av, i) => ({
      alias: av.alias.toLowerCase(),
      expr: createExprFromValue(av.value, `${path}.values[${i}]`)
    })),
    stmt.from ? createDataSourceExpr(stmt.from, `${path}.from`) : undefined,
    stmt.joins?.map((j, i) => createJoinExpr(j, `${path}.joins[${i}]`)),
    stmt.where?.map((w, i) => createBooleanExprFromValue(w, `${path}.where[${i}]`)),
    stmt.groupBy?.map((g, i) => createExprFromValue(g, `${path}.groupBy[${i}]`)),
    stmt.having?.map((h, i) => createBooleanExprFromValue(h, `${path}.having[${i}]`)),
    stmt.orderBy?.map((o, i) => createSortExpr(o, `${path}.orderBy[${i}]`)),
    stmt.offset ?? undefined,
    stmt.limit ?? undefined
  );
}

/**
 * Create an InsertExpr from an Insert statement
 */
export function createInsertExpr(stmt: InsertDBA, path: string): InsertExpr {
  return new InsertExpr(
    path,
    stmt.table.toLowerCase(),
    stmt.columns.map(c => c.toLowerCase()),
    stmt.values?.map((v, i) => createExprFromValue(v, `${path}.values[${i}]`)),
    stmt.select
      ? stmt.select.kind === 'select'
        ? createSelectExpr(stmt.select, `${path}.select`)
        : createSetOperationExpr(stmt.select, `${path}.select`) as any // TODO: Fix SetOperationExpr type
      : undefined,
    stmt.returning?.map((av, i) => ({
      alias: av.alias.toLowerCase(),
      expr: createExprFromValue(av.value, `${path}.returning[${i}]`)
    })),
    stmt.onConflict
      ? {
          columns: stmt.onConflict.columns.map(c => c.toLowerCase()),
          doNothing: stmt.onConflict.doNothing ?? false,
          update: stmt.onConflict.update?.map((cv, i) => ({
            column: cv.column.toLowerCase(),
            expr: createExprFromValue(cv.value, `${path}.onConflict.update[${i}]`)
          }))
        }
      : undefined
  );
}

/**
 * Create an UpdateExpr from an Update statement
 */
export function createUpdateExpr(stmt: UpdateDBA, path: string): UpdateExpr {
  return new UpdateExpr(
    path,
    stmt.table.toLowerCase(),
    stmt.set.map((cv, i) => ({
      column: cv.column.toLowerCase(),
      expr: createExprFromValue(cv.value, `${path}.set[${i}]`)
    })),
    stmt.as?.toLowerCase(),
    stmt.from ? createDataSourceExpr(stmt.from, `${path}.from`) : undefined,
    stmt.joins?.map((j, i) => createJoinExpr(j, `${path}.joins[${i}]`)),
    stmt.where?.map((w, i) => createBooleanExprFromValue(w, `${path}.where[${i}]`)),
    stmt.returning?.map((av, i) => ({
      alias: av.alias.toLowerCase(),
      expr: createExprFromValue(av.value, `${path}.returning[${i}]`)
    }))
  );
}

/**
 * Create a DeleteExpr from a Delete statement
 */
export function createDeleteExpr(stmt: DeleteDBA, path: string): DeleteExpr {
  return new DeleteExpr(
    path,
    stmt.table.toLowerCase(),
    stmt.as?.toLowerCase(),
    stmt.joins?.map((j, i) => createJoinExpr(j, `${path}.joins[${i}]`)),
    stmt.where?.map((w, i) => createBooleanExprFromValue(w, `${path}.where[${i}]`)),
    stmt.returning?.map((av, i) => ({
      alias: av.alias.toLowerCase(),
      expr: createExprFromValue(av.value, `${path}.returning[${i}]`)
    }))
  );
}

/**
 * Create a SetOperationExpr from a SetOperation statement
 */
export function createSetOperationExpr(stmt: SetOperationDBA, path: string): SetOperationExpr {
  return new SetOperationExpr(
    path,
    stmt.kind,
    createSelectExpr(stmt.left, `${path}.left`),
    createSelectExpr(stmt.right, `${path}.right`),
    stmt.all ?? false
  );
}

/**
 * Create a StatementExpr from a Statement discriminated union
 */
export function createStatementExpr(stmt: Statement, path: string): SelectExpr | InsertExpr | UpdateExpr | DeleteExpr | SetOperationExpr {
  switch (stmt.kind) {
    case 'select':
      return createSelectExpr(stmt, path);
    case 'insert':
      return createInsertExpr(stmt, path);
    case 'update':
      return createUpdateExpr(stmt, path);
    case 'delete':
      return createDeleteExpr(stmt, path);
    case 'union':
    case 'intersect':
    case 'except':
      return createSetOperationExpr(stmt, path);
    default:
      throw new Error(`Unknown statement kind at path: ${path}`);
  }
}

/**
 * Create a Query class instance from a Query discriminated union
 */
export function createQueryExpr(query: Query, path: string = 'query'): SelectExpr | InsertExpr | UpdateExpr | DeleteExpr | SetOperationExpr | CTEStatementExpr {
  if ('kind' in query && query.kind === 'withs') {
    // CTEStatement
    return new CTEStatementExpr(
      path,
      query.withs.map((w, i) => {
        if (w.kind === 'cte') {
          return {
            name: w.name.toLowerCase(),
            stmt: createStatementExpr(w.statement, `${path}.withs[${i}].statement`),
            recursive: undefined
          };
        } else {
          // cte-recursive
          return {
            name: w.name.toLowerCase(),
            stmt: createSelectExpr(w.statement, `${path}.withs[${i}].statement`),
            recursive: createSelectExpr(w.recursiveStatement, `${path}.withs[${i}].recursiveStatement`)
          };
        }
      }),
      createStatementExpr(query.final, `${path}.final`)
    );
  } else {
    // Regular statement
    return createStatementExpr(query as Statement, path);
  }
}

// ============================================================================
// Execution Infrastructure and Public API
// ============================================================================

/**
 * Create a QueryContext for execution
 */
export function createQueryContext(
  getTypes: () => TypeDefinition[],
  getManager: (typeName: string) => IDataManager
): QueryContext {
  const types = getTypes();
  const typeMap = new Map<string, TypeDefinition>();
  const fieldTypesMap = new Map<string, Map<string, string>>();

  for (const type of types) {
    const normalizedName = type.name.toLowerCase();
    typeMap.set(normalizedName, type);

    // Build field type map for quick lookup
    const fields = new Map<string, string>();
    fields.set('id', 'string');
    fields.set('created', 'number');
    fields.set('updated', 'number');

    for (const field of type.fields) {
      fields.set(field.name.toLowerCase(), field.type);
    }

    fieldTypesMap.set(normalizedName, fields);
  }

  return {
    types: typeMap,
    aliases: new Map(),
    ctes: new Map(),
    tableStates: new Map(),
    dataManagers: new Map(),
    validationErrors: [],
    fieldTypes: fieldTypesMap,
    getTypes,
    getManager
  };
}

/**
 * Commit a query execution payload
 * This checks if the payload can be committed and applies all pending changes
 */
export async function commitQueryChanges(
  payload: QueryExecutionPayload,
  getManager: (typeName: string) => IDataManager
): Promise<QueryResult> {
  // Check for validation errors first
  if (!payload.result.canCommit) {
    const errorMessages = payload.result.validationErrors
      ?.map((e, i) => `[${i + 1}] ${e.path}: ${e.message}`)
      .join('\n') || 'Unknown validation errors';
    throw new Error(`Cannot commit query with validation errors:\n${errorMessages}`);
  }

  // Check if the payload can be committed (data hasn't changed)
  const canCommit = await canCommitQueryResult(payload, getManager);
  if (!canCommit.canCommit) {
    throw new Error(`Cannot commit query: ${canCommit.reason}`);
  }

  // Commit the changes
  await commitChanges(payload.deltas, getManager);

  return payload.result;
}

/**
 * Extract table deltas from context
 */
export function extractTableDeltas(ctx: QueryContext): Map<string, TableDelta> {
  const deltas = new Map<string, TableDelta>();

  for (const [tableName, state] of ctx.tableStates) {

    const delta: TableDelta = {
      tableName,
      inserts: Array.from(state.inserted.entries()).map(([tempId, fields]) => ({ tempId, fields })),
      updates: Array.from(state.updated.entries()).map(([id, fields]) => ({ id, fields })),
      deletes: Array.from(state.deleted),
      version: state.version
    };

    if (delta.inserts.length > 0 || delta.updates.length > 0 || delta.deletes.length > 0) {
      deltas.set(tableName, delta);
    }
  }

  return deltas;
}

/**
 * Commit changes to data managers
 */
export async function commitChanges(
  deltas: TableDelta[],
  getManager: (typeName: string) => IDataManager
): Promise<void> {
  for (const delta of deltas) {
    const manager = getManager(delta.tableName);

    // Apply all changes in a single save operation
    await manager.save((dataFile) => {
      const now = Date.now();

      // Remove deleted records
      for (const deleted of delta.deletes) {
        const index = dataFile.data.findIndex(r => r.id === deleted);
        if (index >= 0) {
          dataFile.data.splice(index, 1);
        }
      }

      // Update existing records
      for (const updated of delta.updates) {
        const existing = dataFile.data.find(r => r.id === updated.id);
        if (existing) {
          Object.assign(existing.fields, updated.fields);
          existing.updated = now;
        }
      }

      // Insert new records
      for (const inserted of delta.inserts) {
        dataFile.data.push({
          id: inserted.tempId,
          created: now,
          updated: now,
          fields: inserted.fields
        });
      }

      // Update timestamp
      dataFile.updated = now;
    });
  }
}

/**
 * Process ON DELETE cascades and set null operations
 */
export async function processOnDeleteCascades(ctx: QueryContext): Promise<void> {
  // Get all deleted records across all tables
  const deletedByTable = new Map<string, Set<string>>();

  for (const [tableName, state] of ctx.tableStates) {
    if (state.deleted.size > 0) {
      deletedByTable.set(tableName, state.deleted);
    }
  }

  if (deletedByTable.size === 0) {
    return; // No deletes to cascade
  }

  // Process each table's deletes
  for (const [deletedTable, deletedIds] of deletedByTable) {
    const deletedTypeDef = ctx.types.get(deletedTable);
    if (!deletedTypeDef) continue;

    // Find all fields in all types that reference this deleted table
    for (const [tableName, typeDef] of ctx.types) {
      const state = await getTableState(tableName, ctx);

      for (const field of typeDef.fields) {
        // Check if this field references the deleted table
        if (field.type === deletedTable) {
          const onDelete = field.onDelete || 'restrict';

          // Process each current record
          for (const record of state.current) {
            const fieldValue = record.fields[field.name];

            // Check if this record references a deleted ID
            if (fieldValue && deletedIds.has(String(fieldValue))) {
              if (onDelete === 'restrict') {
                ctx.validationErrors.push({
                  path: `cascade.${tableName}.${field.name}`,
                  message: `Cannot delete ${deletedTable} record '${fieldValue}': referenced by ${tableName}.${field.name} in record '${record.id}'`,
                  suggestion: `Remove or update references in ${tableName} first, or change onDelete constraint`
                });
              } else if (onDelete === 'cascade') {
                // Cascade delete this record
                if (!state.deleted.has(record.id)) {
                  state.deleted.add(record.id);
                  state.current = state.current.filter(r => r.id !== record.id);
                }
              } else if (onDelete === 'setNull') {
                // Set field to null
                if (!state.deleted.has(record.id)) {
                  const updatedFields = {
                    ...(state.updated.get(record.id) || {}),
                    [field.name]: null
                  };
                  state.updated.set(record.id, updatedFields);
                  // Update in current array
                  const index = state.current.findIndex(r => r.id === record.id);
                  if (index >= 0) {
                    state.current[index] = {
                      ...state.current[index],
                      fields: { ...state.current[index].fields, [field.name]: null }
                    };
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

/**
 * Validate reference integrity for all modified records
 */
export async function validateReferenceIntegrity(ctx: QueryContext): Promise<void> {
  for (const [tableName, state] of ctx.tableStates) {
    const typeDef = ctx.types.get(tableName);
    if (!typeDef) continue;

    // Validate inserted and updated records
    const recordsToValidate: DataRecord[] = [];

    // Add inserted records
    for (const [id, fields] of state.inserted) {
      const record = state.current.find(r => r.id === id);
      if (record) recordsToValidate.push(record);
    }

    // Add updated records
    for (const [id] of state.updated) {
      const record = state.current.find(r => r.id === id);
      if (record) recordsToValidate.push(record);
    }

    for (const record of recordsToValidate) {
      for (const field of typeDef.fields) {
        const fieldValue = record.fields[field.name];

        // Skip null values
        if (fieldValue === null || fieldValue === undefined) {
          // Check if required
          if (field.required) {
            ctx.validationErrors.push({
              path: `integrity.${tableName}.${record.id}.${field.name}`,
              message: `Required field '${field.name}' is null in ${tableName} record '${record.id}'`,
              suggestion: `Provide a value for ${field.name}`
            });
          }
          continue;
        }

        // Check if field type is a reference to another table
        const referencedType = ctx.types.get(field.type);
        if (referencedType) {
          // This is a foreign key reference - validate it exists
          const referencedState = await getTableState(field.type, ctx);
          const referencedRecord = referencedState.current.find(r => r.id === String(fieldValue));

          if (!referencedRecord) {
            ctx.validationErrors.push({
              path: `integrity.${tableName}.${record.id}.${field.name}`,
              message: `Foreign key violation: ${tableName}.${field.name} references non-existent ${field.type} record '${fieldValue}'`,
              suggestion: `Create the ${field.type} record first, or use a valid ID`
            });
          }
        }

        // Validate enum values
        if (field.enumOptions && field.enumOptions.length > 0) {
          if (!field.enumOptions.includes(String(fieldValue))) {
            ctx.validationErrors.push({
              path: `integrity.${tableName}.${record.id}.${field.name}`,
              message: `Invalid enum value '${fieldValue}' for ${tableName}.${field.name}`,
              suggestion: `Valid options: ${field.enumOptions.join(', ')}`
            });
          }
        }
      }
    }
  }
}

/**
 * Execute a DBA query using the class-based system (v2)
 * Compatible with existing executeQuery interface
 */
export async function executeQuery(
  query: Query,
  getTypes: () => TypeDefinition[],
  getManager: (typeName: string) => IDataManager
): Promise<QueryResult> {
  const { result, deltas } = await executeQueryWithoutCommit(query, getTypes, getManager);

  // Throw on validation errors to match old behavior
  if (result.validationErrors && result.validationErrors.length > 0) {
    const firstError = result.validationErrors[0];
    throw new Error(firstError.message);
  }

  // 8. Commit if valid
  if (result.canCommit) {
    await commitChanges(deltas, getManager);
  }

  return result;
}

/**
 * Execute without committing (for preview/validation)
 */
export async function executeQueryWithoutCommit(
  query: Query,
  getTypes: () => TypeDefinition[],
  getManager: (typeName: string) => IDataManager
): Promise<QueryExecutionPayload> {
  // 1. Convert to class instances
  const queryExpr = createQueryExpr(query);

  // 2. Build context
  const ctx = createQueryContext(getTypes, getManager);

  // 3. Phase 1: Type resolution
  // 4. Collect and pre-load tables using walk pattern
  const tables = queryExpr.getReferencedTables();
  for (const tableName of tables) {
    if (ctx.types.has(tableName)) {
      await getTableState(tableName, ctx);
    }
  }

  // 5. Phase 2: Execute
  const result = await queryExpr.execute(ctx);

  // 6. Post-execution validation
  await processOnDeleteCascades(ctx);
  await validateReferenceIntegrity(ctx);

  // 7. Extract deltas and prepare payload
  const deltas = extractTableDeltas(ctx);  
  result.validationErrors = ctx.validationErrors.length > 0 ? ctx.validationErrors : undefined;
  result.canCommit = ctx.validationErrors.length === 0;

  return {
    result,
    deltas: Array.from(deltas.values())
  };
}

/**
 * Check if a query execution payload can be committed
 * Verifies that table data hasn't changed since query execution
 */
export async function canCommitQueryResult(
  payload: QueryExecutionPayload,
  getManager: (typeName: string) => IDataManager
): Promise<CanCommitResult> {
  const modifiedTables: string[] = [];

  for (const delta of payload.deltas) {
    // Reload the table data to check if it has changed
    const manager = getManager(delta.tableName);
    await manager.load();
    const currentRecords = manager.getAll();
    const currentVersion = computeTableVersion(currentRecords);

    if (currentVersion !== delta.version) {
      modifiedTables.push(delta.tableName);
    }
  }

  if (modifiedTables.length > 0) {
    return {
      canCommit: false,
      reason: `Table(s) have been modified since query execution: ${modifiedTables.join(', ')}`,
      modifiedTables,
    };
  }

  return {
    canCommit: true,
  };
}
