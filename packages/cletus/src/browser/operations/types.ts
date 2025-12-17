import { Operation } from '../../schemas';

/**
 * Common props for all operation renderers
 */
export interface OperationRendererProps {
  operation: Operation;
  operationIndex?: number;
  onApprove?: (index: number) => void;
  onReject?: (index: number) => void;
  approvalDecision?: 'approve' | 'reject';
  onToggleDecision?: (index: number, decision: 'approve' | 'reject') => void;
  hasMultipleOperations?: boolean;
}
