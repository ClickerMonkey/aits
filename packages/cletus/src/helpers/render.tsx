import React from "react";
import { Box, Text } from "ink";
import { COLORS } from "../constants";
import { abbreviate, formatTime } from "../common";
import { Operation } from "../schemas";

/**
 * Format a value for display in operation input/output
 * - Arrays: JSON.stringify
 * - Non-objects (primitives): String(x)
 * - Objects: bullet list with hyphens, property values JSON.stringified
 */
function formatValue(value: any): React.ReactNode {
  // Arrays: use JSON.stringify
  if (Array.isArray(value)) {
    return <Text>{JSON.stringify(value, null, 2)}</Text>;
  }
  
  // Non-objects (primitives): use String(x)
  if (typeof value !== 'object' || value === null) {
    return <Text>{String(value)}</Text>;
  }
  
  // Objects: bullet list with hyphens
  return (
    <Box flexDirection="column">
      {Object.entries(value).map(([key, val], i) => (
        <Box key={i}>
          <Text>- {key}: {JSON.stringify(val)}</Text>
        </Box>
      ))}
    </Box>
  );
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
  const duration = op.end ? op.end - op.start : Date.now() - op.start;
  return formatTime(duration);
}

/**
 * Get summary text for an operation
 */
export function getSummary(
  op: Operation,
  getSummaryText?: (op: Operation) => string | null
): string {
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
export function renderOperation(
  op: Operation,
  operationLabel: string,
  getSummaryText?: (op: Operation) => string | null,
  showInput?: boolean,
  showOutput?: boolean
): React.ReactNode {
  const { color: statusColor, label: statusLabel } = getStatusInfo(op.status);
  const elapsed = getElapsedTime(op);
  const summary = getSummary(op, getSummaryText);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={statusColor as any}>● </Text>
        <Text>{operationLabel} </Text>
        <Text dimColor>[{statusLabel}] </Text>
        <Text dimColor>({elapsed})</Text>
      </Box>
      <Box marginLeft={2}>
        <Text>{' → '}</Text>
        <Text color={op.error ? COLORS.ERROR_TEXT : undefined}>{summary}</Text>
      </Box>
      
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
      
      {showOutput && op.output && (
        <>
          <Box marginLeft={2} marginTop={1}>
            <Text bold dimColor>Output:</Text>
          </Box>
          <Box marginLeft={4} flexDirection="column">
            {formatValue(op.output)}
          </Box>
        </>
      )}
    </Box>
  );
}
