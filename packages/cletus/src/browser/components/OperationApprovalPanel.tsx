import React, { useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import type { Message } from '../../schemas';

interface OperationApprovalPanelProps {
  message: Message;
  onApproveReject: (approved: number[], rejected: number[]) => void;
}

export const OperationApprovalPanel: React.FC<OperationApprovalPanelProps> = ({
  message,
  onApproveReject,
}) => {
  const [operationDecisions, setOperationDecisions] = useState<Map<number, 'approve' | 'reject'>>(new Map());

  // Get operations that need approval
  const approvableOperations = (message.operations || [])
    .map((op, idx) => ({ op, idx }))
    .filter(({ op }) => op.status === 'analyzed');

  if (approvableOperations.length === 0) {
    return null;
  }

  const hasMultipleOperations = approvableOperations.length > 1;

  const handleApproveAll = () => {
    const approved = approvableOperations.map(({ idx }) => idx);
    onApproveReject(approved, []);
  };

  const handleRejectAll = () => {
    const rejected = approvableOperations.map(({ idx }) => idx);
    onApproveReject([], rejected);
  };

  const handleToggleOperation = (idx: number) => {
    const newDecisions = new Map(operationDecisions);
    const currentDecision = newDecisions.get(idx);

    if (currentDecision === 'approve') {
      newDecisions.set(idx, 'reject');
    } else if (currentDecision === 'reject') {
      newDecisions.delete(idx); // Back to undecided
    } else {
      newDecisions.set(idx, 'approve');
    }

    setOperationDecisions(newDecisions);
  };

  const handleSubmitDecisions = () => {
    const approved: number[] = [];
    const rejected: number[] = [];

    approvableOperations.forEach(({ idx }) => {
      const decision = operationDecisions.get(idx);
      if (decision === 'approve') {
        approved.push(idx);
      } else if (decision === 'reject') {
        rejected.push(idx);
      } else {
        // Undecided operations are rejected by default
        rejected.push(idx);
      }
    });

    onApproveReject(approved, rejected);
  };

  const getOperationIcon = (idx: number) => {
    const decision = operationDecisions.get(idx);
    if (decision === 'approve') {
      return <CheckCircle2 className="w-5 h-5 text-green-400" />;
    } else if (decision === 'reject') {
      return <XCircle className="w-5 h-5 text-red-400" />;
    }
    return <AlertCircle className="w-5 h-5 text-yellow-400" />;
  };

  const getOperationName = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <div className="border border-yellow-500/30 rounded-lg p-4 mb-4 bg-yellow-500/5">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="w-5 h-5 text-yellow-400" />
        <h3 className="font-semibold text-yellow-400">
          {approvableOperations.length} {approvableOperations.length === 1 ? 'Operation' : 'Operations'} Require Approval
        </h3>
      </div>

      {/* Quick actions for multiple operations */}
      {hasMultipleOperations && (
        <div className="flex gap-2 mb-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleApproveAll}
            className="text-green-400 border-green-400/30 hover:bg-green-400/10"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Approve All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRejectAll}
            className="text-red-400 border-red-400/30 hover:bg-red-400/10"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Reject All
          </Button>
        </div>
      )}

      {/* Operation list */}
      <div className="space-y-2 mb-3">
        {approvableOperations.map(({ op, idx }) => (
          <div
            key={idx}
            className="flex items-start gap-3 p-3 rounded border border-border bg-card/30 cursor-pointer hover:bg-card/50 transition-colors"
            onClick={() => handleToggleOperation(idx)}
          >
            <div className="flex-shrink-0 mt-0.5">
              {getOperationIcon(idx)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{getOperationName(op.type)}</div>
              {op.analysis && (
                <div className="text-xs text-muted-foreground mt-1">{op.analysis}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Submit button for individual decisions */}
      {hasMultipleOperations && (
        <div className="flex justify-end">
          <Button
            variant="neon"
            size="sm"
            onClick={handleSubmitDecisions}
          >
            Submit Decisions
          </Button>
        </div>
      )}

      {/* Single operation buttons */}
      {!hasMultipleOperations && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleApproveAll}
            className="flex-1 text-green-400 border-green-400/30 hover:bg-green-400/10"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRejectAll}
            className="flex-1 text-red-400 border-red-400/30 hover:bg-red-400/10"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
};
