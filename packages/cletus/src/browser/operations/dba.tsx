import React from 'react';
import { Operation } from '../../schemas';
import { BaseOperationDisplay } from './BaseOperationDisplay';
import { formatName, abbreviate } from '../../shared';
import { createRenderer } from './render';


const renderer = createRenderer({
  borderColor: "border-neon-blue/30",
  bgColor: "bg-neon-blue/5",
  labelColor: "text-neon-blue",
});

export const data_index = renderer<'data_index'>(
  (op) => {
    const typeName = op.cache?.typeName || op.input.type;
    return `${formatName(typeName)}Index()`;
  },
  (op) => {
    const typeName = op.cache?.typeName || op.input.type;
    if (op.output?.libraryKnowledgeUpdated) {
      return `Knowledge updated for type: ${typeName}`;
    }
    return null;
  }
);

export const data_import: React.FC<OperationRendererProps> = ({ operation }) => {
  const typeName = operation.cache?.typeName || formatName(operation.input.type);
  let summary = operation.analysis;

  if (operation.output) {
    summary = `Imported ${operation.output.imported} new, updated ${operation.output.updated}, skipped ${operation.output.updateSkippedNoChanges || 0} duplicate(s)`;
  } else if (operation.cache?.importableCount !== undefined) {
    summary = `Will import from ${operation.cache.importableCount} file(s)`;
  }

  return (
    <BaseOperationDisplay
      operation={operation}
      label={`${typeName}Import("${operation.input.glob}")`}
      summary={summary}
      borderColor="border-neon-blue/30"
      bgColor="bg-neon-blue/5"
      labelColor="text-neon-blue"
    />
  );
};

export const data_search: React.FC<OperationRendererProps> = ({ operation }) => {
  const typeName = operation.cache?.typeName || formatName(operation.input.type);
  const query = abbreviate(operation.input.query, 20);
  const summary = operation.output?.results
    ? `Found ${operation.output.results.length} result${operation.output.results.length !== 1 ? 's' : ''}`
    : operation.analysis;

  return (
    <BaseOperationDisplay
      operation={operation}
      label={`${typeName}Search("${query}")`}
      summary={summary}
      borderColor="border-neon-blue/30"
      bgColor="bg-neon-blue/5"
      labelColor="text-neon-blue"
    />
  );
};

export const data_get: React.FC<OperationRendererProps> = ({ operation }) => {
  const typeName = operation.cache?.typeName || formatName(operation.input.type);
  const offset = operation.input.offset ?? 0;
  const limit = operation.input.limit ?? 10;

  let summary = operation.analysis;
  if (operation.output) {
    const count = operation.output.records.length;
    summary = `Retrieved ${count} of ${operation.output.total} record${operation.output.total !== 1 ? 's' : ''}`;
  }

  return (
    <BaseOperationDisplay
      operation={operation}
      label={`${typeName}Get(offset: ${offset}, limit: ${limit})`}
      summary={summary}
      borderColor="border-neon-blue/30"
      bgColor="bg-neon-blue/5"
      labelColor="text-neon-blue"
    />
  );
};

export const query: React.FC<OperationRendererProps> = ({ operation }) => {
  // Extract query information from input or cache
  const isStringQuery = typeof operation.input.query === 'string';
  const queryString = operation.cache?.queryString || (isStringQuery ? operation.input.query : null);

  // Build label
  let label: string;
  if (queryString) {
    const abbreviated = queryString.length > 50 ? queryString.substring(0, 50) + '...' : queryString;
    label = `Query("${abbreviated}")`;
  } else {
    label = 'Query()';
  }

  // Build summary from output (matching CLI logic from dba.tsx lines 932-946)
  let summary: string | null = null;
  if (operation.output) {
    const parts: string[] = [];
    if (operation.output.rows?.length > 0) {
      parts.push(`${operation.output.rows.length} row${operation.output.rows.length !== 1 ? 's' : ''}`);
    }
    if (operation.output.inserted?.length) {
      const count = operation.output.inserted.reduce((a: number, b: any) => a + b.ids.length, 0);
      parts.push(`${count} inserted`);
    }
    if (operation.output.updated?.length) {
      const count = operation.output.updated.reduce((a: number, b: any) => a + b.ids.length, 0);
      parts.push(`${count} updated`);
    }
    if (operation.output.deleted?.length) {
      const count = operation.output.deleted.reduce((a: number, b: any) => a + b.ids.length, 0);
      parts.push(`${count} deleted`);
    }
    summary = parts.length > 0 ? parts.join(', ') : 'Query executed';
  } else if (operation.cache?.canCommit && !operation.cache.canCommit.canCommit) {
    summary = `Cannot execute: ${operation.cache.canCommit.reason}`;
  } else if (operation.analysis) {
    summary = operation.analysis;
  }

  return (
    <BaseOperationDisplay
      operation={operation}
      label={label}
      summary={summary}
      borderColor="border-neon-blue/30"
      bgColor="bg-neon-blue/5"
      labelColor="text-neon-blue"
    />
  );
};
