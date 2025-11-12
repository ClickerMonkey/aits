import { Box, Text, useInput } from 'ink';
import React, { useEffect, useRef, useState } from 'react';
import type { CletusAI } from '../ai';
import type { ChatFile } from '../chat';
import { OperationManager } from '../operations/manager';
import type { Message } from '../schemas';
import { on } from 'events';
import { COLORS } from '../constants';
import { formatTime } from '../common';

interface OperationApprovalMenuProps {
  message: Message;
  ai: CletusAI;
  onMessageUpdate?: (message: Message) => void;
  onComplete: () => void;
}

type MenuState = 'main' | 'approving-some' | 'processing' | 'complete';

interface CompletionResult {
  success: number;
  failed: number;
  rejected: number;
  hasErrors: boolean;
}

export const OperationApprovalMenu: React.FC<OperationApprovalMenuProps> = ({
  message,
  ai,
  onMessageUpdate,
  onComplete,
}) => {
  const [menuState, setMenuState] = useState<MenuState>('main');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentOperationIndex, setCurrentOperationIndex] = useState(0);
  const [operationDecisions, setOperationDecisions] = useState<Map<number, 'approve' | 'reject'>>(new Map());
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [completionResult, setCompletionResult] = useState<CompletionResult | null>(null);
  const startTimeRef = useRef<number>(0);

  // Get operations that need approval
  const approvableOperations = (message.operations || [])
    .map((op, idx) => ({ op, idx }))
    .filter(({ op }) => op.status === 'analyzed');

  const hasMultipleOperations = approvableOperations.length > 1;

  // Timer for elapsed time
  useEffect(() => {
    if (isProcessing) {
      startTimeRef.current = Date.now();
      const interval = setInterval(() => {
        setElapsedTime(Date.now() - startTimeRef.current);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isProcessing]);

  // Auto-dismiss after completion
  useEffect(() => {
    if (menuState === 'complete') {
      const timeout = setTimeout(() => {
        onComplete();
      }, 2500);
      return () => clearTimeout(timeout);
    }
  }, [menuState, onComplete]);

  const executeOperations = async (indices: number[]) => {
    setIsProcessing(true);
    setMenuState('processing');
    setElapsedTime(0);
    const startTime = Date.now();

    try {
      const operations = message.operations || [];
      const manager = new OperationManager('none');

      const ctx = await ai.buildContext({});

      let success = 0;
      let failed = 0;

      // Execute each approved operation
      for (const idx of indices) {
        const op = operations[idx];
        await manager.execute(op, true, ctx);

        if (op.status === 'done') {
          success++;
        } else if (op.status === 'doneError') {
          failed++;
        }
      }

      const elapsed = (Date.now() - startTime) / 1000;

      // Generate summary message
      let summaryText = '';
      if (indices.length === 1) {
        const op = operations[indices[0]];
        if (failed > 0) {
          summaryText = `Operation ${op.type} failed after ${formatTime(elapsed)}`;
        } else {
          summaryText = `Operation ${op.type} executed in ${formatTime(elapsed)}`;
        }
      } else {
        summaryText = `${indices.length} operations executed in ${formatTime(elapsed)}`;
      }

      // Update the message with new operation states and summary
      message.content.push({
        type: 'text',
        content: `__${summaryText}__`,
      });
      onMessageUpdate?.(message)

      setCompletionResult({
        success,
        failed,
        rejected: 0,
        hasErrors: failed > 0,
      });
      setIsProcessing(false);
      setMenuState('complete');
    } catch (error: any) {
      console.error('Failed to execute operations:', error);
      setCompletionResult({
        success: 0,
        failed: indices.length,
        rejected: 0,
        hasErrors: true,
      });
      setIsProcessing(false);
      setMenuState('complete');
    }
  };

  const rejectOperations = async (indices: number[]) => {
    setIsProcessing(true);
    setMenuState('processing');
    setElapsedTime(0);

    try {
      const operations = message.operations || [];

      // Mark operations as rejected
      for (const idx of indices) {
        operations[idx].status = 'rejected';
        operations[idx].message = `Operation ${operations[idx].type} rejected by user`;
      }

      // Generate summary message
      const summaryText = indices.length === 1
        ? 'Operation rejected'
        : `${indices.length} operations rejected`;

      // Update the message
      message.content.push({
        type: 'text',
        content: `__${summaryText}__`,
      });
      onMessageUpdate?.(message)

      setCompletionResult({
        success: 0,
        failed: 0,
        rejected: indices.length,
        hasErrors: false,
      });
      setIsProcessing(false);
      setMenuState('complete');
    } catch (error: any) {
      console.error('Failed to reject operations:', error);
      setCompletionResult({
        success: 0,
        failed: 0,
        rejected: 0,
        hasErrors: true,
      });
      setIsProcessing(false);
      setMenuState('complete');
    }
  };

  const handleMainMenuSelection = async () => {
    if (hasMultipleOperations) {
      if (selectedIndex === 0) {
        // Approve all
        await executeOperations(approvableOperations.map(({ idx }) => idx));
      } else if (selectedIndex === 1) {
        // Reject all
        await rejectOperations(approvableOperations.map(({ idx }) => idx));
      } else if (selectedIndex === 2) {
        // Approve some
        setMenuState('approving-some');
        setCurrentOperationIndex(0);
        setSelectedIndex(0);
      }
    } else {
      // Single operation - approve or reject based on selection
      if (selectedIndex === 0) {
        await executeOperations([approvableOperations[0].idx]);
      } else {
        await rejectOperations([approvableOperations[0].idx]);
      }
    }
  };

  const handleOperationDecision = async () => {
    const decision = selectedIndex === 0 ? 'approve' : 'reject';
    const newDecisions = new Map(operationDecisions);
    newDecisions.set(approvableOperations[currentOperationIndex].idx, decision);
    setOperationDecisions(newDecisions);

    // Move to next operation or finish
    if (currentOperationIndex < approvableOperations.length - 1) {
      setCurrentOperationIndex(currentOperationIndex + 1);
      setSelectedIndex(0);
    } else {
      // All decisions made, execute
      const approved: number[] = [];
      const rejected: number[] = [];

      newDecisions.forEach((decision, idx) => {
        if (decision === 'approve') {
          approved.push(idx);
        } else {
          rejected.push(idx);
        }
      });

      // Process both approved and rejected in one go
      setIsProcessing(true);
      setMenuState('processing');
      setElapsedTime(0);
      const startTime = Date.now();

      try {
        const operations = message.operations || [];
        const manager = new OperationManager('none');
        const ctx = await ai.buildContext({});

        let success = 0;
        let failed = 0;

        // Execute approved operations
        for (const idx of approved) {
          const op = operations[idx];
          await manager.execute(op, true, ctx);
          if (op.status === 'done') {
            success++;
          } else if (op.status === 'doneError') {
            failed++;
          }
        }

        // Mark rejected operations
        for (const idx of rejected) {
          operations[idx].status = 'rejected';
          operations[idx].message = `Operation ${operations[idx].type} rejected by user`;
        }

        const elapsed = (Date.now() - startTime) / 1000;

        // Generate summary message
        const parts: string[] = [];
        if (success > 0) {
          parts.push(`${success} executed`);
        }
        if (failed > 0) {
          parts.push(`${failed} failed`);
        }
        if (rejected.length > 0) {
          parts.push(`${rejected.length} rejected`);
        }
        const summaryText = `${parts.join(', ')} in ${formatTime(elapsed)}`;

        // Update the message
        message.content.push({
          type: 'text',
          content: `__${summaryText}__`,
        });
        onMessageUpdate?.(message)

        setCompletionResult({
          success,
          failed,
          rejected: rejected.length,
          hasErrors: failed > 0,
        });
        setIsProcessing(false);
        setMenuState('complete');
      } catch (error: any) {
        console.error('Failed to process operations:', error);
        setCompletionResult({
          success: 0,
          failed: approved.length,
          rejected: rejected.length,
          hasErrors: true,
        });
        setIsProcessing(false);
        setMenuState('complete');
      }
    }
  };

  // Handle keyboard input - MUST be called unconditionally (before any returns)
  useInput(
    (input, key) => {
      if (isProcessing || approvableOperations.length === 0) return;

      if (menuState === 'main') {
        // Main menu navigation
        const menuOptions = hasMultipleOperations ? 3 : 2;

        if (key.upArrow) {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : menuOptions - 1));
        } else if (key.downArrow) {
          setSelectedIndex((prev) => (prev < menuOptions - 1 ? prev + 1 : 0));
        } else if (key.return) {
          handleMainMenuSelection();
        }
      } else if (menuState === 'approving-some') {
        // Operation-by-operation approval
        if (key.upArrow) {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 1));
        } else if (key.downArrow) {
          setSelectedIndex((prev) => (prev < 1 ? prev + 1 : 0));
        } else if (key.return) {
          handleOperationDecision();
        }
      }
    },
    { isActive: !isProcessing && approvableOperations.length > 0 }
  );

  // Early return AFTER all hooks are called - but not if we're processing or showing completion
  if (approvableOperations.length === 0 && menuState !== 'processing' && menuState !== 'complete') {
    return null;
  }

  // Processing state
  if (menuState === 'processing') {
    return (
      <Box
        borderStyle="round"
        borderColor={COLORS.PROCESSING_BORDER}
        paddingX={1}
        marginBottom={1}
        flexDirection="column"
      >
        <Text color={COLORS.PROCESSING_TEXT}>
          Processing operations... {(elapsedTime / 1000).toFixed(1)}s
        </Text>
      </Box>
    );
  }

  // Completion state
  if (menuState === 'complete' && completionResult) {
    const { success, failed, rejected, hasErrors } = completionResult;
    const borderColor = hasErrors ? COLORS.ERROR_BORDER : COLORS.SUCCESS_BORDER;
    const textColor = hasErrors ? COLORS.ERROR_TEXT : COLORS.SUCCESS_TEXT;

    let message = '';
    const parts: string[] = [];

    if (success > 0) {
      parts.push(`${success} completed`);
    }
    if (failed > 0) {
      parts.push(`${failed} failed`);
    }
    if (rejected > 0) {
      parts.push(`${rejected} rejected`);
    }

    if (parts.length === 1 && rejected > 0) {
      message = `✓ ${parts[0]}`;
    } else if (hasErrors) {
      message = `✗ ${parts.join(', ')}`;
    } else {
      message = `✓ ${parts.join(', ')}`;
    }

    return (
      <Box
        borderStyle="round"
        borderColor={borderColor}
        paddingX={1}
        marginBottom={1}
        flexDirection="column"
      >
        <Text color={textColor}>{message}</Text>
      </Box>
    );
  }

  if (menuState === 'main') {
    return (
      <Box
        borderStyle="round"
        borderColor={COLORS.APPROVAL_BORDER}
        paddingX={1}
        marginBottom={1}
        flexDirection="column"
      >
        <Text bold color={COLORS.APPROVAL_BORDER}>
          {approvableOperations.length} operation{approvableOperations.length !== 1 ? 's' : ''} require{approvableOperations.length === 1 ? 's' : ''} approval (↑↓ to navigate, Enter to select):
        </Text>

        {hasMultipleOperations ? (
          <>
            <Box>
              <Text color={selectedIndex === 0 ? COLORS.APPROVAL_SELECTED : COLORS.APPROVAL_UNSELECTED}>
                {selectedIndex === 0 ? '▶ ' : '  '}Approve all
              </Text>
            </Box>
            <Box>
              <Text color={selectedIndex === 1 ? COLORS.APPROVAL_SELECTED : COLORS.APPROVAL_UNSELECTED}>
                {selectedIndex === 1 ? '▶ ' : '  '}Reject all
              </Text>
            </Box>
            <Box>
              <Text color={selectedIndex === 2 ? COLORS.APPROVAL_SELECTED : COLORS.APPROVAL_UNSELECTED}>
                {selectedIndex === 2 ? '▶ ' : '  '}Approve some
              </Text>
            </Box>
          </>
        ) : (
          <>
            <Box>
              <Text color={selectedIndex === 0 ? COLORS.APPROVAL_SELECTED : COLORS.APPROVAL_UNSELECTED}>
                {selectedIndex === 0 ? '▶ ' : '  '}Approve
              </Text>
            </Box>
            <Box>
              <Text color={selectedIndex === 1 ? COLORS.APPROVAL_SELECTED : COLORS.APPROVAL_UNSELECTED}>
                {selectedIndex === 1 ? '▶ ' : '  '}Reject
              </Text>
            </Box>
          </>
        )}
      </Box>
    );
  }

  // Approving some - show current operation
  const currentOp = approvableOperations[currentOperationIndex];

  return (
    <Box
      borderStyle="round"
      borderColor={COLORS.APPROVAL_BORDER}
      paddingX={1}
      marginBottom={1}
      flexDirection="column"
    >
      <Text bold color={COLORS.APPROVAL_BORDER}>
        Operation {currentOperationIndex + 1} of {approvableOperations.length}: {currentOp.op.type}
      </Text>

      <Box marginTop={1} marginBottom={1}>
        <Text dimColor>{currentOp.op.analysis}</Text>
      </Box>

      <Box>
        <Text color={selectedIndex === 0 ? COLORS.APPROVAL_SELECTED : COLORS.APPROVAL_UNSELECTED}>
          {selectedIndex === 0 ? '▶ ' : '  '}Approve
        </Text>
      </Box>
      <Box>
        <Text color={selectedIndex === 1 ? COLORS.APPROVAL_SELECTED : COLORS.APPROVAL_UNSELECTED}>
          {selectedIndex === 1 ? '▶ ' : '  '}Reject
        </Text>
      </Box>
    </Box>
  );
};
