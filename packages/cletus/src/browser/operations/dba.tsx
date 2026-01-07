import type { Query } from '../../helpers/dba';
import { abbreviate, formatName, pluralize } from '../../shared';
import { createRenderer } from './render';


const renderer = createRenderer({
  borderColor: "border-neon-blue/30",
  bgColor: "bg-neon-blue/5",
  labelColor: "text-neon-blue",
});

/**
 * Get the kind of a query statement for display
 */
function getQueryKind(query: Query): string {
  if ('kind' in query) {
    if (query.kind === 'withs') {
      return 'cte';
    }
    return query.kind.toLowerCase();
  }
  return 'query';
}

/**
 * Get a brief description of the query for display
 */
function describeQuery(query: Query): string {
  if ('kind' in query) {
    switch (query.kind) {
      case 'select':
        const selectParts: string[] = [];
        if (query.from?.kind === 'table') {
          selectParts.push(`from ${query.from.table}`);
        }
        if (query.joins?.length) {
          selectParts.push(`${query.joins.length} join(s)`);
        }
        if (query.where?.length) {
          selectParts.push('filtered');
        }
        if (query.groupBy?.length) {
          selectParts.push('grouped');
        }
        return selectParts.length > 0 ? selectParts.join(', ') : 'simple';

      case 'insert':
        return `into ${query.table}`;

      case 'update':
        return `${query.table}`;

      case 'delete':
        return `from ${query.table}`;

      case 'union':
      case 'intersect':
      case 'except':
        return `${query.kind}`;

      case 'withs':
        const cteNames = query.withs.map(w => w.name).join(', ');
        return `CTEs: ${cteNames}`;

      default:
        return '';
    }
  }
  return '';
}

export const data_index = renderer<'data_index'>(
  (op) => {
    return `${formatName(op.cache?.typeName || op.input.type)}Index()`;
  },
  (op) => {
    const typeName = op.cache?.typeName || op.input.type;
    if (op.output?.libraryKnowledgeUpdated) {
      return `Knowledge updated for type: ${typeName}`;
    }
    return null;
  }
);

export const data_import = renderer<'data_import'>(
  (op) => {
    const typeName = formatName(op.cache?.typeName || op.input.type);
    return `${typeName}Import("${op.input.glob}")`;
  },
  (op) => {
    if (op.output) {
      return `Imported ${op.output.imported} new, updated ${op.output.updated}, skipped ${op.output.updateSkippedNoChanges || 0} duplicate(s)`;
    } else if (op.cache?.importableCount !== undefined) {
      return `Will import from ${op.cache.importableCount} file(s)`;
    }
    return null;
  }
);

export const data_search = renderer<'data_search'>(
  (op) => {
    const typeName = formatName(op.cache?.typeName || op.input.type);
    const query = abbreviate(op.input.query, 20);
    return `${typeName}Search("${query}")`;
  },
  (op) => {
    if (op.output) {
      return `Found ${pluralize(op.output.results.length, 'result')}`;
    }
    return null;
  }
);

export const data_get = renderer<'data_get'>(
  (op) => {
    const typeName = formatName(op.cache?.typeName || op.input.type);
    const offset = op.input.offset ?? 0;
    const limit = op.input.limit ?? 10;
    return `${typeName}Get(${offset}, ${limit})`;
  },
  (op) => {
    if (op.output) {
      return `Retrieved ${op.output.records.length} of ${op.output.total} records`;
    }
    return null;
  }
);

export const query = renderer<'query'>(
  (op) => {
    // Check if the query was originally a string
    const isStringQuery = typeof op.input.query === 'string';
    const queryToUse = op.cache?.builtQuery || (typeof op.input.query === 'string' ? null : op.input.query);

    let kind: string;
    let description: string;

    if (isStringQuery && op.cache?.queryString) {
      // For string queries, use abbreviated string in render
      kind = 'query';
      description = abbreviate(op.cache.queryString, 100);
    } else if (queryToUse) {
      kind = getQueryKind(queryToUse);
      description = describeQuery(queryToUse);
    } else {
      kind = 'query';
      description = '';
    }

    // Determine render name based on referenced tables
    const referencedTables = op.cache?.payload?.result?.tables || [];
    if (referencedTables.length === 1) {
      // Single table - use typeName format
      const typeName = formatName(referencedTables[0]);
      return `${typeName}Query(${kind}${description ? `: ${description}` : ''})`;
    } else {
      // Multiple tables or unknown - just use Query
      return `Query(${kind}${description ? `: ${description}` : ''})`;
    }
  },
  (op) => {
    // Build summary from output (matching CLI logic from dba.tsx lines 932-946)
    if (op.output) {
      const parts: string[] = [];
      if (op.output.rows?.length > 0) {
        parts.push(`${op.output.rows.length} row${op.output.rows.length !== 1 ? 's' : ''}`);
      }
      if (op.output.inserted?.length) {
        const count = op.output.inserted.reduce((a: number, b: any) => a + b.ids.length, 0);
        parts.push(`${count} inserted`);
      }
      if (op.output.updated?.length) {
        const count = op.output.updated.reduce((a: number, b: any) => a + b.ids.length, 0);
        parts.push(`${count} updated`);
      }
      if (op.output.deleted?.length) {
        const count = op.output.deleted.reduce((a: number, b: any) => a + b.ids.length, 0);
        parts.push(`${count} deleted`);
      }
      return parts.length > 0 ? parts.join(', ') : 'Query executed';
    } else if (op.cache?.canCommit && !op.cache.canCommit.canCommit) {
      return `Cannot execute: ${op.cache.canCommit.reason}`;
    }
    return null;
  }
);
