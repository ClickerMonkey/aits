import { Box, Text } from 'ink';
import React from 'react';
import { COLORS } from '../theme';
import { Operations } from '../operations/types';
import type { Message } from '../schemas';
import { Markdown } from './Markdown';
import { CletusAI } from '../ai';
import { formatName } from '../common';


interface MessageDisplayProps {
  message: Message;
  ai: CletusAI;
  showInput?: boolean;
  showOutput?: boolean;
}

/**
 * Component for rendering a chat message with consistent styling
 */
export const MessageDisplay: React.FC<MessageDisplayProps> = ({ message, ai, showInput = false, showOutput = false }) => {
  const isUser = message.role === 'user';
  const color = message.role === 'user' 
    ? COLORS.USER
    : message.role === 'system' 
      ? COLORS.SYSTEM 
      : COLORS.ASSISTANT;

  const prefix = message.role === 'user'
      ? `${message.name || 'You'}`
      : message.role === 'system'
        ? 'System'
        : `${message.name ?? 'Assistant'}`;

  // Determine circle icon color based on message state
  let circleColor: string;
  if (isUser) {
    circleColor = COLORS.STATUS_USER; // Purple for user
  } else if (!message.operations || message.operations.length === 0) {
    circleColor = COLORS.STATUS_NO_OPS; // Gray for assistant with no operations
  } else if (message.operations.every((op) => op.status === 'done')) {
    circleColor = COLORS.STATUS_DONE; // Green if all operations are done
  } else if (message.operations.some((op) => op.status === 'analyzed')) {
    circleColor = COLORS.STATUS_ANALYZED; // Yellow if there are analyzed operations
  } else {
    circleColor = COLORS.STATUS_IN_PROGRESS; // Orange for everything else
  }

  const mappedContent = message.content.map((c) => ({ ...c, operation: c.operationIndex !== undefined ? message.operations?.[c.operationIndex] : undefined }));
  const visibleContent = mappedContent.filter(c => (c.content.trim().length > 0 || c.operation) && (c.type === 'text' || c.type === 'reasoning'));

  return (
    <Box flexDirection="column" marginBottom={1} flexGrow={1}>
      <Box>
        <Text color={circleColor}>● </Text>
        <Text bold color={color}>
          {prefix}:
        </Text>
      </Box>
      {isUser ? (
        <Box borderStyle={'round'} flexDirection="row" flexGrow={1}>
          <Box width={1}><Text>&gt;</Text></Box>
          <Box flexDirection="column" marginX={1}>
            {message.content.map((part, i) => (
              <Markdown key={i}>{part.content}</Markdown>
            ))}
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginLeft={1} flexGrow={1}>
          {visibleContent.map((c, i) => {
            if (c.operation) {
              const operationDef = Operations[c.operation.type];
              if (operationDef?.render) {
                return (
                  <Box key={i} marginBottom={1} flexGrow={1}>
                    {operationDef.render(c.operation, ai, showInput, showOutput)}
                  </Box>
                );
              } else {
              return (
                  <Box key={i} marginBottom={1}>
                    <Text dimColor>
                      [{formatName(c.operation.type)}] - [{c.operation.status}]
                    </Text>
                  </Box>
                );
              }
            } else if (c.type === 'reasoning') {
              const parts: string[] = [];
              if (c.content) {
                parts.push(c.content);
              }
              if (c.reasoning?.content) {
                parts.push(c.reasoning.content);
              } else if (c.reasoning?.details) {
                for (const detail of c.reasoning.details) {
                  if (detail.summary) {
                    parts.push(detail.summary);
                  }
                  if (detail.text) {
                    parts.push(detail.text);
                  }
                }
              }
              const content = parts.join('\n\n');

              return (
                <Box key={i} marginBottom={1} borderStyle="round" borderColor="yellow" paddingX={1}>
                  <Markdown>{content}</Markdown>
                </Box>
              );
            } else {
              return (
                <Markdown key={i} marginBottom={1} flexGrow={1}>{c.content}</Markdown>
              );
            }
          })}
        </Box>
      )}
      {/* Display message cost and usage if available */}
      {(showInput || showOutput) && (message.cost !== undefined || message.usage) && (
        <Box marginLeft={1} marginTop={0}>
          <Text dimColor>
            {message.cost !== undefined && message.cost > 0 && (
              <>cost: ${message.cost.toFixed(5)}</>
            )}
            {message.usage?.text && (
              <>
                {message.cost !== undefined && message.cost > 0 ? ' │ ' : ''}
                tokens: {(message.usage.text.input || 0) + (message.usage.text.output || 0)}
              </>
            )}
          </Text>
        </Box>
      )}
    </Box>
  );
};
