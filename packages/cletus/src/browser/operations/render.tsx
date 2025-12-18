import React from 'react';
import { Operation, OperationKind } from '../../schemas';
import { OperationDataFor } from '../../operations/types';
import { BaseOperationDisplay, BaseOperationDisplayProps } from './BaseOperationDisplay';

/**
 * Get status color and label for an operation status
 */
export function getStatusInfo(status: Operation['status']): { color: string; label: string } {
  switch (status) {
    case 'done':
      return { color: 'text-green-400', label: 'completed' };
    case 'doing':
      return { color: 'text-orange-400', label: 'in progress' };
    case 'analyzed':
      return { color: 'text-yellow-400', label: 'pending approval' };
    case 'doneError':
      return { color: 'text-red-400', label: 'error' };
    case 'analyzeError':
      return { color: 'text-red-400', label: 'analysis error' };
    case 'analyzedBlocked':
      return { color: 'text-red-400', label: 'blocked' };
    case 'rejected':
      return { color: 'text-red-400', label: 'rejected' };
    default:
      return { color: 'text-muted-foreground', label: status };
  }
}

/**
 * Calculate elapsed time for an operation
 */
export function getElapsedTime(op: Operation): string {
  if (!op.start) return '';
  const duration = op.end ? op.end - op.start : Date.now() - op.start;

  if (duration < 1000) return `${Math.round(duration)}ms`;
  if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
  return `${Math.floor(duration / 60000)}m ${Math.round((duration % 60000) / 1000)}s`;
}

export interface OperationDisplayProps {
  operation: Operation;
  operationIndex?: number;
  onApprove?: (index: number) => void;
  onReject?: (index: number) => void;
  approvalDecision?: 'approve' | 'reject';
  onToggleDecision?: (index: number, decision: 'approve' | 'reject') => void;
  hasMultipleOperations?: boolean;
}

/**
 * Default operation renderer - delegates to BaseOperationDisplay
 */
export const OperationDisplay: React.FC<OperationDisplayProps> = (props) => (
  <BaseOperationDisplay
    {...props}
    label={props.operation.type}
    summary={props.operation.analysis}
  />
);

/**
 * Create a renderer for a specific operation kind
 * @param common 
 * @returns 
 */
export const createRenderer = (common: Partial<BaseOperationDisplayProps> = {}) => {
  return <K extends OperationKind>(
    getLabel: (op: OperationDataFor<K>) => string, 
    getSummary?: (op: OperationDataFor<K>) => string | React.ReactNode | null,
    getProps?: (op: OperationDataFor<K>) => Partial<BaseOperationDisplayProps>
  ) => {
    return (props: OperationDisplayProps) => {
      const operation = props.operation as any as OperationDataFor<K>;
      const label = getLabel(operation);
      const summary = operation.error || (getSummary ? getSummary(operation) : null) || operation.analysis;
      const additionalProps = getProps ? getProps(operation) : {};

      return (
        <BaseOperationDisplay
          {...common}
          {...additionalProps}
          operation={operation}
          label={label}
          summary={summary}
        />
      );
    };
  }
};

export function linkFile(path: string) {
  return path;
}