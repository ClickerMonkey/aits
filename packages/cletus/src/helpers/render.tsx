import React from "react";
import { Box, Text } from "ink";
import { COLORS } from "../constants";
import { abbreviate, formatTime, formatValue as formatValueText } from "../common";
import { Operation } from "../schemas";
import { Markdown } from "../components/Markdown";

/**
 * Format a value for display in operation input/output (React wrapper)
 * Uses the text-based formatValue from common.ts and wraps it in a Text component.
 * 
 * @param value - value to format
 * @returns React component with formatted value
 */
function formatValue(value: any): React.ReactNode {
  const formatted = formatValueText(value);
  return <Text>{formatted}</Text>;
}

/**
 * Get status color and label for an operation status
 */
export function getStatusInfo(status: Operation['status']): { color: string; label: string } {
  switch (status) {
    case 'done':
      return { color: COLORS.STATUS_DONE, label: 'completed' };
    case 'doing':
      return { color: COLORS.STATUS_IN_PROGRESS, label: 'in progress' };
    case 'analyzed':
      return { color: COLORS.STATUS_ANALYZED, label: 'pending approval' };
    case 'doneError':
      return { color: COLORS.ERROR_TEXT, label: 'error' };
    case 'analyzeError':
      return { color: COLORS.ERROR_TEXT, label: 'analysis error' };
    case 'analyzedBlocked':
      return { color: COLORS.ERROR_TEXT, label: 'blocked' };
    default:
      return { color: COLORS.DIM_TEXT, label: status };
  }
}

/**
 * Calculate elapsed time for an operation
 */
export function getElapsedTime(op: Operation): string {
  if (!op.start) return '';
  const duration = op.end ? op.end - op.start : performance.now() - op.start;
  return formatTime(duration);
}

/**
 * Get summary text for an operation
 */
export function getSummary<TOperation extends Operation>(
  op: TOperation,
  getSummaryText?: (op: TOperation) => React.ReactNode | string | null
): string | React.ReactNode {
  if (op.error) {
    return op.error;
  }

  // Use custom summary function if provided
  if (getSummaryText) {
    const customSummary = getSummaryText(op);
    if (customSummary) {
      return customSummary;
    }
  }

  // Fallback to analysis or default
  if (op.analysis) {
    return abbreviate(op.analysis!.replaceAll(/\n/g, ' '), 60);
  }

  return 'Processing...';
}

/**
 * Render an operation with a standard format
 *
 * @param op - The operation to render
 * @param operationLabel - Display label for the operation (e.g., "FileCreate(...)")
 * @param getSummaryText - Optional function to generate custom summary text
 * @param showInput - Whether to show detailed input
 * @param showOutput - Whether to show detailed output
 */
export function renderOperation<TOperation extends Operation>(
  op: TOperation,
  operationLabel: string,
  getSummaryText?: (op: TOperation) => React.ReactNode | string | null,
  showInput?: boolean,
  showOutput?: boolean
): React.ReactNode {
  const { color: statusColor, label: statusLabel } = getStatusInfo(op.status);
  const elapsed = getElapsedTime(op);
  const summary = getSummary(op, getSummaryText);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexGrow={1}>
        <Text color={statusColor as any}>●{' '}</Text>
        <Text wrap="truncate-end">{operationLabel}</Text>
        <Text dimColor>{' '}[{statusLabel}]</Text>
        <Text dimColor>{' '}({elapsed})</Text>
      </Box>

      {typeof summary === 'string' ? (
        op.error ? (
          <Box marginLeft={2} flexGrow={1}>
            <Text>{' → '}</Text>
            <Text color={COLORS.ERROR_TEXT}>{summary}</Text>
          </Box>
        ) : (
          <Box marginLeft={2} flexGrow={1}>
            <Text>{' → '}</Text>
            <Markdown>{summary}</Markdown>
          </Box>
        )
      ) : (
        summary
      )}
      
      {showInput && (
        <>
          <Box marginLeft={2} marginTop={1}>
            <Text bold dimColor>Input:</Text>
          </Box>
          <Box marginLeft={4} flexDirection="column">
            {formatValue(op.input)}
          </Box>
        </>
      )}
      
      {showOutput && (op.analysis || op.output) && (
        <>
          <Box marginLeft={2} marginTop={1}>
            <Text bold dimColor>{op.output ? 'Output' : 'Analysis'}:</Text>
          </Box>
          <Box marginLeft={4} flexDirection="column">
            {formatValue(op.output || op.analysis)}
          </Box>
        </>
      )}
    </Box>
  );
}
