import React from 'react';
import { Operation } from '../../schemas';
import { BaseOperationDisplay } from './BaseOperationDisplay';
import { formatName } from '../../shared';

interface OperationRendererProps {
  operation: Operation;
  showInput?: boolean;
  showOutput?: boolean;
}

export const type_info: React.FC<OperationRendererProps> = ({ operation }) => {
  const typeName = operation.cache?.typeName || formatName(operation.input.name);
  const summary = operation.output?.type
    ? `Found type: ${operation.output.type.friendlyName}`
    : operation.output?.type === null
    ? 'Type not found'
    : operation.analysis;

  return (
    <BaseOperationDisplay
      operation={operation}
      label={`${typeName}Info()`}
      summary={summary}
      borderColor="border-neon-cyan/30"
      bgColor="bg-neon-cyan/5"
      labelColor="text-neon-cyan"
    />
  );
};

export const type_list: React.FC<OperationRendererProps> = ({ operation }) => {
  const summary = operation.output?.types?.length
    ? `Found ${operation.output.types.length} type${operation.output.types.length !== 1 ? 's' : ''}`
    : operation.output?.types
    ? 'No types found'
    : operation.analysis;

  return (
    <BaseOperationDisplay
      operation={operation}
      label="TypeList()"
      summary={summary}
      borderColor="border-neon-cyan/30"
      bgColor="bg-neon-cyan/5"
      labelColor="text-neon-cyan"
    />
  );
};

export const type_create: React.FC<OperationRendererProps> = ({ operation }) => {
  const typeName = operation.cache?.typeName || formatName(operation.input.name);
  const summary = operation.output?.created ? 'Created type successfully' : operation.analysis;

  return (
    <BaseOperationDisplay
      operation={operation}
      label={`${typeName}Create()`}
      summary={summary}
      borderColor="border-neon-cyan/30"
      bgColor="bg-neon-cyan/5"
      labelColor="text-neon-cyan"
    />
  );
};

export const type_update: React.FC<OperationRendererProps> = ({ operation }) => {
  const typeName = operation.cache?.typeName || formatName(operation.input.name);
  const updateKeys = operation.input.update ? Object.keys(operation.input.update).join(', ') : '';
  const summary = operation.output?.updated ? 'Updated type successfully' : operation.analysis;

  return (
    <BaseOperationDisplay
      operation={operation}
      label={`${typeName}Update(${updateKeys})`}
      summary={summary}
      borderColor="border-neon-cyan/30"
      bgColor="bg-neon-cyan/5"
      labelColor="text-neon-cyan"
    />
  );
};

export const type_delete: React.FC<OperationRendererProps> = ({ operation }) => {
  const typeName = operation.cache?.typeName || formatName(operation.input.name);
  const summary = operation.output?.deleted ? 'Deleted type successfully' : operation.analysis;

  return (
    <BaseOperationDisplay
      operation={operation}
      label={`${typeName}Delete()`}
      summary={summary}
      borderColor="border-neon-cyan/30"
      bgColor="bg-neon-cyan/5"
      labelColor="text-neon-cyan"
    />
  );
};

export const type_import: React.FC<OperationRendererProps> = ({ operation }) => {
  const summary = operation.output?.imported
    ? `Imported ${operation.output.imported} type${operation.output.imported !== 1 ? 's' : ''}`
    : operation.analysis;

  return (
    <BaseOperationDisplay
      operation={operation}
      label={`TypeImport("${operation.input.path}")`}
      summary={summary}
      borderColor="border-neon-cyan/30"
      bgColor="bg-neon-cyan/5"
      labelColor="text-neon-cyan"
    />
  );
};
