import z from "zod";

export type Source = string; // table or alias or with statement name
export type Table = string; // table that can be read from
export type Column = string; // column name, used for insert/update (lvalues)
export type Alias = string; // alias for a value, used for select or returning
export type SourceColumn = { source: Source, column: Column }; // used for rvalues
export type Constant = number|string|boolean|null; // dates are represented as strings in yyyy-mm-dd format and dateTimes include millisecond precision. duration fields are stored as pg intervals
export type Aggregate = 'count'|'min'|'max'|'avg'|'sum';
export type Binary = '+'|'-'|'*'|'/';
export type Unary = '-';
export type Comparison = '='|'<'|'>'|'<='|'>='|'<>'|'like'|'notLike'; // etc
export type SelectOrSet = Select | SetOperation;

export type BooleanValue =
  { kind: 'comparison', left: Value, cmp: Comparison, right: Value } |
  { kind: 'in', value: Value, in: Value[] | SelectOrSet } | // select should have exactly one value.
  { kind: 'between', value: Value, between: [Value, Value] } |
  { kind: 'isNull', isNull: Value } |
  { kind: 'exists', exists: SelectOrSet } | // select values should be [1] and a limit of 1 for efficiency
  { kind: 'and', and: BooleanValue[] } |
  { kind: 'or', or: BooleanValue[] } |
  { kind: 'not', not: BooleanValue };

export type Function = 
  'concat'|'substring'|'length'|'lower'|'upper'|'trim'|'replace'| // string
  'abs'|'ceil'|'floor'|'round'|'power'|'sqrt'| // number
  'now'|'current_date'|'date_add'|'date_sub'|'extract'|'date_trunc'| // date
  'coalesce'|'nullif'|'greatest'|'least'; // logic

export type FunctionCall = {
  kind: 'function';
  function: Function;
  args: Value[];
};
export type WindowValue = {
  kind: 'window';
  function: Aggregate | string;
  value: Value;
  partitionBy?: Value[] | null;
  orderBy?: Sort[] | null;
};

export type Value =
  SourceColumn |
  Constant |
  Select | // that has limit of 1 and one value, or one value thats an aggregate
  BooleanValue |
  FunctionCall |
  WindowValue |
  { kind: 'binary', left: Value, op: Binary, right: Value } | // +/*-
  { kind: 'unary', unary: Unary, value: Value } |
  { kind: 'aggregate', aggregate: Aggregate, value: Value | '*'} |
  { kind: 'semanticSimilarity', semanticSimilarity: Table } | // special, returns a number between 1 and -1, 1 being most similar to the users question. expensive but if the user has a question that cant be perfectly represented as a query this can work well against an entire row of a table.
  { kind: 'case', case: { when: BooleanValue, then: Value }[], else?: Value | null }

export type Sort = { value: Value, dir: 'asc'|'desc' };

export type DataSource =  {
  kind: 'table';
  table: Table;
  as?: string | null;
} | {
  kind: 'subquery';
  subquery: SelectOrSet;
  as: string;
}
export type Join = {
  source: DataSource;
  type: 'inner' | 'left' | 'right' | 'full'; // or cross
  on: BooleanValue[];
}
export type AliasValue = {
  alias: Alias;  
  value: Value;
}
export type ColumnValue = {
  column: Column;
  value: Value;
}
export type Select = {
  kind: 'select';
  distinct?: boolean | null; // distinct rows
  values: AliasValue[]; // values to select, alias is required
  from?: DataSource | null;
  joins?: Join[] | null;
  where?: BooleanValue[] | null; // anded together
  groupBy?: Value[] | null;
  having?: BooleanValue[] | null; // anded together
  orderBy?: Sort[] | null;
  offset?: number | null;
  limit?: number | null;
}
export type Insert = {
  kind: "insert";
  table: Table;
  as?: string | null; // alias for the table
  columns: Column[];
  values?: Value[] | null; // or select, not both
  select?: SelectOrSet | null;
  returning?: AliasValue[] | null;
  onConflict?: {
    columns: Column[];
    doNothing?: boolean | null;
    update?: ColumnValue[] | null;
  } | null;
};
export type Update = {
  kind: "update";
  set: ColumnValue[];
  table: Table;
  as?: string | null; // alias for the table
  from?: DataSource | null;
  joins?: Join[] | null;
  where?: BooleanValue[] | null; // anded together
  returning?: AliasValue[] | null;
};
export type Delete = {
  kind: "delete";
  table: Table;
  as?: string | null; // alias for the table
  joins?: Join[] | null;
  where?: BooleanValue[] | null; // anded together
  returning?: AliasValue[] | null;
};
export type SetOperation = {
  kind: 'union' | 'intersect' | 'except';
  left: Select;
  right: Select;
  all?: boolean | null;
};
export type Statement = Insert | Update | Select | Delete | SetOperation;
export type WithStatement = 
  { kind: 'cte', name: string; statement: Statement } | // select, insert, update, delete with returning
  { kind: 'cte-recursive', name: string; statement: Select; recursiveStatement: Select };
// for efficiency, when using with statements any following or the final statement should ideally only select from a previous "with" since the results of withs are not indexed joining on them is slow.
export type CTEStatement = {
  kind: "withs",
  withs: WithStatement[];
  final: Statement;
};

export type Query = Statement | CTEStatement;

// Schema factory function that generates schemas based on type definitions
export function createDBASchemas(types: Array<{ name: string; fields: Array<{ name: string }> }>) {
  // Generate table enum from type definitions
  const tableNames = types.map(t => t.name);
  const TableSchema: z.ZodType<Table> = tableNames.length > 0
    ? z.enum(tableNames as [string, ...string[]]).meta({ aid: 'Table' }).describe('Database table name')
    : z.string().meta({ aid: 'Table' }).describe('Database table name');

  // Basic type schemas
  const SourceSchema: z.ZodType<Source> = z.string().meta({ aid: 'Source' }).describe('Table name, alias, or CTE name');
  const ColumnSchema: z.ZodType<Column> = z.string().meta({ aid: 'Column' }).describe('Column name');
  const AliasSchema: z.ZodType<Alias> = z.string().meta({ aid: 'Alias' }).describe('Alias for a value in SELECT or RETURNING clause');

  const SourceColumnSchema: z.ZodType<SourceColumn> = z.union([
    ...types.map(t => z.object({
      source: z.literal(t.name),
      column: z.enum(t.fields.map(f => f.name) as [string, ...string[]]).describe(`Column name from table ${t.name}`),
    }).describe(`Reference to a column from table ${t.name}`)),
    z.object({
      source: SourceSchema.describe('Alias or CTE name'),
      column: ColumnSchema.describe('Column name from the source'),
    })
  ]).meta({ aid: 'SourceColumn' }).describe('Reference to a column from a specific source')

  const ConstantSchema: z.ZodType<Constant> = z.union([
    z.number(),
    z.string(),
    z.boolean(),
    z.null()
  ]).meta({ aid: 'Constant' }).describe('Constant value: number, string, boolean, or null');

  const AggregateSchema: z.ZodType<Aggregate> = z.enum(['count', 'min', 'max', 'avg', 'sum']).meta({ aid: 'Aggregate' }).describe('Aggregate function');
  const BinarySchema: z.ZodType<Binary> = z.enum(['+', '-', '*', '/']).meta({ aid: 'Binary' }).describe('Binary operator');
  const UnarySchema: z.ZodType<Unary> = z.enum(['-']).meta({ aid: 'Unary' }).describe('Unary operator');
  const ComparisonSchema: z.ZodType<Comparison> = z.enum(['=', '<', '>', '<=', '>=', '<>', 'like', 'notLike']).meta({ aid: 'Comparison' }).describe('Comparison operator');

  const FunctionSchema: z.ZodType<Function> = z.enum([
    'concat', 'substring', 'length', 'lower', 'upper', 'trim', 'replace',
    'abs', 'ceil', 'floor', 'round', 'power', 'sqrt',
    'now', 'current_date', 'date_add', 'date_sub', 'extract', 'date_trunc',
    'coalesce', 'nullif', 'greatest', 'least'
  ]).meta({ aid: 'Function' }).describe('Built-in SQL function');

  // Forward declarations for recursive types
  const ValueSchema: z.ZodType<Value> = z.lazy(() => z.union([
    SourceColumnSchema,
    ConstantSchema,
    SelectSchema,
    BooleanValueSchema,
    FunctionCallSchema,
    WindowValueSchema,
    z.object({
      kind: z.literal('binary'),
      left: ValueSchema.describe('Left operand'),
      op: BinarySchema.describe('Binary operator'),
      right: ValueSchema.describe('Right operand')
    }).describe('Binary operation'),
    z.object({
      kind: z.literal('unary'),
      unary: UnarySchema.describe('Unary operator'),
      value: ValueSchema.describe('Operand value')
    }).describe('Unary operation'),
    z.object({
      kind: z.literal('aggregate'),
      aggregate: AggregateSchema.describe('Aggregate function'),
      value: z.union([ValueSchema, z.literal('*')]).describe('Value to aggregate')
    }).describe('Aggregate operation'),
    z.object({
      kind: z.literal('semanticSimilarity'),
      semanticSimilarity: TableSchema.describe('Table to compare against using semantic similarity')
    }).describe('Semantic similarity search'),
    z.object({
      kind: z.literal('case'),
      case: z.array(z.object({
        when: BooleanValueSchema.describe('Condition'),
        then: ValueSchema.describe('Result value when condition is true')
      })).describe('CASE branches'),
      else: ValueSchema.nullable().optional().describe('Default value when no conditions match')
    }).describe('CASE expression')
  ])).meta({ aid: 'Value' }).describe('SQL value expression');

  const BooleanValueSchema: z.ZodType<BooleanValue> = z.lazy(() => z.union([
    z.object({
      kind: z.literal('comparison'),
      left: ValueSchema.describe('Left operand'),
      cmp: ComparisonSchema.describe('Comparison operator'),
      right: ValueSchema.describe('Right operand')
    }).describe('Comparison expression'),
    z.object({
      kind: z.literal('in'),
      value: ValueSchema.describe('Value to test'),
      in: z.union([z.array(ValueSchema), SelectOrSetSchema]).describe('List of values or subquery')
    }).describe('IN predicate'),
    z.object({
      kind: z.literal('between'),
      value: ValueSchema.describe('Value to test'),
      between: z.tuple([ValueSchema, ValueSchema]).describe('Range bounds [min, max]')
    }).describe('BETWEEN predicate'),
    z.object({
      kind: z.literal('isNull'),
      isNull: ValueSchema.describe('Value to test for NULL')
    }).describe('IS NULL predicate'),
    z.object({
      kind: z.literal('exists'),
      exists: SelectOrSetSchema.describe('Subquery to test for existence')
    }).describe('EXISTS predicate'),
    z.object({
      kind: z.literal('and'),
      and: z.array(BooleanValueSchema).describe('Boolean expressions to AND together')
    }).describe('AND expression'),
    z.object({
      kind: z.literal('or'),
      or: z.array(BooleanValueSchema).describe('Boolean expressions to OR together')
    }).describe('OR expression'),
    z.object({
      kind: z.literal('not'),
      not: BooleanValueSchema.describe('Boolean expression to negate')
    }).describe('NOT expression')
  ])).meta({ aid: 'BooleanValue' }).describe('Boolean expression');

  const FunctionCallSchema: z.ZodType<FunctionCall> = z.object({
    kind: z.literal('function'),
    function: FunctionSchema.describe('Function name'),
    args: z.array(ValueSchema).describe('Function arguments'),
  }).meta({ aid: 'FunctionCall' }).describe('Function call');

  const SortSchema: z.ZodType<Sort> = z.object({
    value: ValueSchema.describe('Value to sort by'),
    dir: z.enum(['asc', 'desc']).describe('Sort direction')
  }).meta({ aid: 'Sort' }).describe('Sort specification');

  const WindowValueSchema: z.ZodType<WindowValue> = z.object({
    kind: z.literal('window'),
    function: z.union([AggregateSchema, z.string()]).describe('Window function name'),
    value: ValueSchema.describe('Value to compute over'),
    partitionBy: z.array(ValueSchema).nullable().optional().describe('PARTITION BY expressions'),
    orderBy: z.array(SortSchema).nullable().optional().describe('ORDER BY specifications'),
  }).meta({ aid: 'WindowValue' }).describe('Window function');

  const AliasValueSchema: z.ZodType<AliasValue> = z.object({
    alias: AliasSchema.describe('Alias name'),
    value: ValueSchema.describe('Value expression'),
  }).meta({ aid: 'AliasValue' }).describe('Aliased value for SELECT or RETURNING');

  const ColumnValueSchema: z.ZodType<ColumnValue> = z.object({
    column: ColumnSchema.describe('Column name'),
    value: ValueSchema.describe('Value to assign'),
  }).meta({ aid: 'ColumnValue' }).describe('Column assignment for INSERT or UPDATE');

  // Forward declaration for SelectOrSet
  const SelectOrSetSchema: z.ZodType<SelectOrSet> = z.lazy(() => z.union([
    SelectSchema,
    SetOperationSchema
  ])).meta({ aid: 'SelectOrSet' }).describe('SELECT query or set operation');

  const DataSourceSchema: z.ZodType<DataSource> = z.lazy(() => z.union([
    z.object({
      kind: z.literal('table'),
      table: TableSchema.describe('Table name'),
      as: z.string().nullable().optional().describe('Table alias'),
    }).describe('Table data source'),
    z.object({
      kind: z.literal('subquery'),
      subquery: SelectOrSetSchema.describe('Subquery'),
      as: z.string().describe('Subquery alias (required)'),
    }).describe('Subquery data source')
  ])).meta({ aid: 'DataSource' }).describe('Data source for FROM clause');

  const JoinSchema: z.ZodType<Join> = z.object({
    source: DataSourceSchema.describe('Data source to join'),
    type: z.enum(['inner', 'left', 'right', 'full']).describe('Join type'),
    on: z.array(BooleanValueSchema).describe('Join conditions (ANDed together)'),
  }).meta({ aid: 'Join' }).describe('JOIN specification');

  const SelectSchema: z.ZodType<Select> = z.lazy(() => z.object({
    kind: z.literal('select'),
    distinct: z.boolean().nullable().optional().describe('Whether to return distinct rows'),
    values: z.array(AliasValueSchema).describe('Values to select'),
    from: DataSourceSchema.nullable().optional().describe('FROM data source'),
    joins: z.array(JoinSchema).nullable().optional().describe('JOIN clauses'),
    where: z.array(BooleanValueSchema).nullable().optional().describe('WHERE conditions (ANDed together)'),
    groupBy: z.array(ValueSchema).nullable().optional().describe('GROUP BY expressions'),
    having: z.array(BooleanValueSchema).nullable().optional().describe('HAVING conditions (ANDed together)'),
    orderBy: z.array(SortSchema).nullable().optional().describe('ORDER BY specifications'),
    offset: z.number().nullable().optional().describe('Number of rows to skip'),
    limit: z.number().nullable().optional().describe('Maximum number of rows to return'),
  })).meta({ aid: 'Select' }).describe('SELECT statement');

  // Create typed insert schemas for each table type
  const typedInsertSchemas = types.map(t => {
    const columnNames = t.fields.map(f => f.name) as [string, ...string[]];
    const TypedColumnSchema = z.enum(columnNames).describe(`Column from ${t.name}`);
    const TypedColumnValueSchema = z.object({
      column: TypedColumnSchema.describe('Column name'),
      value: ValueSchema.describe('Value to assign'),
    }).meta({ aid: `${t.name}_ColumnValue` }).describe(`Column assignment for ${t.name}`);
    
    return z.object({
      kind: z.literal('insert'),
      table: z.literal(t.name).describe(`Insert into ${t.name} table`),
      as: z.string().nullable().optional().describe('Table alias'),
      columns: z.array(TypedColumnSchema).describe(`Columns to insert into ${t.name}`),
      values: z.array(ValueSchema).nullable().optional().describe('Values to insert (mutually exclusive with select)'),
      select: SelectOrSetSchema.nullable().optional().describe('SELECT query for values (mutually exclusive with values)'),
      returning: z.array(AliasValueSchema).nullable().optional().describe('RETURNING clause'),
      onConflict: z.object({
        columns: z.array(TypedColumnSchema).describe('Conflict target columns'),
        doNothing: z.boolean().nullable().optional().describe('Whether to do nothing on conflict'),
        update: z.array(TypedColumnValueSchema).nullable().optional().describe('Column updates on conflict'),
      }).nullable().optional().describe('ON CONFLICT clause'),
    }).meta({ aid: `Insert_${t.name}` }).describe(`INSERT statement for ${t.name}`);
  });
  
  // Union of typed insert schemas, or generic fallback if no types defined
  const InsertSchema: z.ZodType<Insert> = types.length > 0
    ? z.union(typedInsertSchemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]).meta({ aid: 'Insert' }).describe('INSERT statement')
    : z.object({
        kind: z.literal('insert'),
        table: TableSchema.describe('Target table'),
        as: z.string().nullable().optional().describe('Table alias'),
        columns: z.array(ColumnSchema).describe('Columns to insert into'),
        values: z.array(ValueSchema).nullable().optional().describe('Values to insert (mutually exclusive with select)'),
        select: SelectOrSetSchema.nullable().optional().describe('SELECT query for values (mutually exclusive with values)'),
        returning: z.array(AliasValueSchema).nullable().optional().describe('RETURNING clause'),
        onConflict: z.object({
          columns: z.array(ColumnSchema).describe('Conflict target columns'),
          doNothing: z.boolean().nullable().optional().describe('Whether to do nothing on conflict'),
          update: z.array(ColumnValueSchema).nullable().optional().describe('Column updates on conflict'),
        }).nullable().optional().describe('ON CONFLICT clause'),
      }).meta({ aid: 'Insert' }).describe('INSERT statement');

  // Create typed update schemas for each table type
  const typedUpdateSchemas = types.map(t => {
    const columnNames = t.fields.map(f => f.name) as [string, ...string[]];
    const TypedColumnSchema = z.enum(columnNames).describe(`Column from ${t.name}`);
    const TypedColumnValueSchema = z.object({
      column: TypedColumnSchema.describe('Column name'),
      value: ValueSchema.describe('Value to assign'),
    }).meta({ aid: `${t.name}_ColumnValue` }).describe(`Column assignment for ${t.name}`);
    
    return z.object({
      kind: z.literal('update'),
      set: z.array(TypedColumnValueSchema).describe(`Column assignments for ${t.name}`),
      table: z.literal(t.name).describe(`Update ${t.name} table`),
      as: z.string().nullable().optional().describe('Table alias'),
      from: DataSourceSchema.nullable().optional().describe('FROM data source'),
      joins: z.array(JoinSchema).nullable().optional().describe('JOIN clauses'),
      where: z.array(BooleanValueSchema).nullable().optional().describe('WHERE conditions (ANDed together)'),
      returning: z.array(AliasValueSchema).nullable().optional().describe('RETURNING clause'),
    }).meta({ aid: `Update_${t.name}` }).describe(`UPDATE statement for ${t.name}`);
  });
  
  // Union of typed update schemas, or generic fallback if no types defined
  const UpdateSchema: z.ZodType<Update> = types.length > 0
    ? z.union(typedUpdateSchemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]).meta({ aid: 'Update' }).describe('UPDATE statement')
    : z.object({
        kind: z.literal('update'),
        set: z.array(ColumnValueSchema).describe('Column assignments'),
        table: TableSchema.describe('Target table'),
        as: z.string().nullable().optional().describe('Table alias'),
        from: DataSourceSchema.nullable().optional().describe('FROM data source'),
        joins: z.array(JoinSchema).nullable().optional().describe('JOIN clauses'),
        where: z.array(BooleanValueSchema).nullable().optional().describe('WHERE conditions (ANDed together)'),
        returning: z.array(AliasValueSchema).nullable().optional().describe('RETURNING clause'),
      }).meta({ aid: 'Update' }).describe('UPDATE statement');

  // Create typed delete schemas for each table type
  const typedDeleteSchemas = types.map(t => {
    return z.object({
      kind: z.literal('delete'),
      table: z.literal(t.name).describe(`Delete from ${t.name} table`),
      as: z.string().nullable().optional().describe('Table alias'),
      joins: z.array(JoinSchema).nullable().optional().describe('JOIN clauses'),
      where: z.array(BooleanValueSchema).nullable().optional().describe('WHERE conditions (ANDed together)'),
      returning: z.array(AliasValueSchema).nullable().optional().describe('RETURNING clause'),
    }).meta({ aid: `Delete_${t.name}` }).describe(`DELETE statement for ${t.name}`);
  });
  
  // Union of typed delete schemas, or generic fallback if no types defined
  const DeleteSchema: z.ZodType<Delete> = types.length > 0
    ? z.union(typedDeleteSchemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]).meta({ aid: 'Delete' }).describe('DELETE statement')
    : z.object({
        kind: z.literal('delete'),
        table: TableSchema.describe('Target table'),
        as: z.string().nullable().optional().describe('Table alias'),
        joins: z.array(JoinSchema).nullable().optional().describe('JOIN clauses'),
        where: z.array(BooleanValueSchema).nullable().optional().describe('WHERE conditions (ANDed together)'),
        returning: z.array(AliasValueSchema).nullable().optional().describe('RETURNING clause'),
      }).meta({ aid: 'Delete' }).describe('DELETE statement');

  const SetOperationSchema: z.ZodType<SetOperation> = z.lazy(() => z.object({
    kind: z.enum(['union', 'intersect', 'except']).describe('Set operation type'),
    left: SelectSchema.describe('Left SELECT query'),
    right: SelectSchema.describe('Right SELECT query'),
    all: z.boolean().nullable().optional().describe('Whether to include duplicates (ALL)'),
  })).meta({ aid: 'SetOperation' }).describe('Set operation (UNION, INTERSECT, EXCEPT)');

  const StatementSchema: z.ZodType<Statement> = z.lazy(() => z.union([
    InsertSchema,
    UpdateSchema,
    SelectSchema,
    DeleteSchema,
    SetOperationSchema
  ])).meta({ aid: 'Statement' }).describe('SQL statement');

  const WithStatementSchema: z.ZodType<WithStatement> = z.lazy(() => z.union([
    z.object({
      kind: z.literal('cte'),
      name: z.string().describe('CTE name'),
      statement: StatementSchema.describe('CTE statement'),
    }).describe('Simple CTE'),
    z.object({
      kind: z.literal('cte-recursive'),
      name: z.string().describe('CTE name'),
      statement: SelectSchema.describe('Initial SELECT for recursive CTE'),
      recursiveStatement: SelectSchema.describe('Recursive SELECT'),
    }).describe('Recursive CTE')
  ])).meta({ aid: 'WithStatement' }).describe('WITH statement (CTE)');

  const CTEStatementSchema: z.ZodType<CTEStatement> = z.object({
    kind: z.literal('withs'),
    withs: z.array(WithStatementSchema).describe('CTE definitions'),
    final: StatementSchema.describe('Final statement that uses the CTEs'),
  }).meta({ aid: 'CTEStatement' }).describe('Statement with CTEs');

  const QuerySchema: z.ZodType<Query> = z.union([
    StatementSchema,
    CTEStatementSchema
  ]).meta({ aid: 'Query' }).describe('Complete SQL query');

  return {
    SourceSchema,
    TableSchema,
    ColumnSchema,
    AliasSchema,
    SourceColumnSchema,
    ConstantSchema,
    AggregateSchema,
    BinarySchema,
    UnarySchema,
    ComparisonSchema,
    FunctionSchema,
    ValueSchema,
    BooleanValueSchema,
    FunctionCallSchema,
    SortSchema,
    WindowValueSchema,
    AliasValueSchema,
    ColumnValueSchema,
    SelectOrSetSchema,
    DataSourceSchema,
    JoinSchema,
    SelectSchema,
    InsertSchema,
    UpdateSchema,
    DeleteSchema,
    SetOperationSchema,
    StatementSchema,
    WithStatementSchema,
    CTEStatementSchema,
    QuerySchema,
  };
}

// Default schemas with no type definitions (tables/columns as strings)
const defaultSchemas = createDBASchemas([]);

export const SourceSchema = defaultSchemas.SourceSchema;
export const TableSchema = defaultSchemas.TableSchema;
export const ColumnSchema = defaultSchemas.ColumnSchema;
export const AliasSchema = defaultSchemas.AliasSchema;
export const SourceColumnSchema = defaultSchemas.SourceColumnSchema;
export const ConstantSchema = defaultSchemas.ConstantSchema;
export const AggregateSchema = defaultSchemas.AggregateSchema;
export const BinarySchema = defaultSchemas.BinarySchema;
export const UnarySchema = defaultSchemas.UnarySchema;
export const ComparisonSchema = defaultSchemas.ComparisonSchema;
export const FunctionSchema = defaultSchemas.FunctionSchema;
export const ValueSchema = defaultSchemas.ValueSchema;
export const BooleanValueSchema = defaultSchemas.BooleanValueSchema;
export const FunctionCallSchema = defaultSchemas.FunctionCallSchema;
export const SortSchema = defaultSchemas.SortSchema;
export const WindowValueSchema = defaultSchemas.WindowValueSchema;
export const AliasValueSchema = defaultSchemas.AliasValueSchema;
export const ColumnValueSchema = defaultSchemas.ColumnValueSchema;
export const SelectOrSetSchema = defaultSchemas.SelectOrSetSchema;
export const DataSourceSchema = defaultSchemas.DataSourceSchema;
export const JoinSchema = defaultSchemas.JoinSchema;
export const SelectSchema = defaultSchemas.SelectSchema;
export const InsertSchema = defaultSchemas.InsertSchema;
export const UpdateSchema = defaultSchemas.UpdateSchema;
export const DeleteSchema = defaultSchemas.DeleteSchema;
export const SetOperationSchema = defaultSchemas.SetOperationSchema;
export const StatementSchema = defaultSchemas.StatementSchema;
export const WithStatementSchema = defaultSchemas.WithStatementSchema;
export const CTEStatementSchema = defaultSchemas.CTEStatementSchema;
export const QuerySchema = defaultSchemas.QuerySchema;