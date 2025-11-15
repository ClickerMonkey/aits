import { Box, Text } from 'ink';
import React from 'react';
import { ConfigFile } from '../config';
import { COLORS } from '../constants';
import { Operations } from '../operations/types';
import type { Message } from '../schemas';
import { Markdown } from './Markdown';


interface MessageDisplayProps {
  message: Message;
  config: ConfigFile;
  showInput?: boolean;
  showOutput?: boolean;
}

/**
 * Component for rendering a chat message with consistent styling
 */
export const MessageDisplay: React.FC<MessageDisplayProps> = ({ message, config, showInput = false, showOutput = false }) => {
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
  const visibleContent = mappedContent.filter(c => (c.content.trim().length > 0 || c.operation) && c.type === 'text');

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={circleColor as any}>● </Text>
        <Text bold color={color}>
          {prefix}:
        </Text>
      </Box>
      {isUser ? (
        <Box borderStyle={'round'} flexDirection="row" paddingX={1}>
          <Box width={1}><Text>&gt;</Text></Box>
          <Box flexDirection="column" marginLeft={1} flexGrow={1}>
            {message.content.map((part, i) => (
              <Markdown key={i}>{part.content}</Markdown>
            ))}
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginLeft={1}>
          {visibleContent.map((c, i) => {
            if (c.operation) {
              const operationDef = Operations[c.operation.type];
              if (operationDef?.render) {
                return (
                  <Box key={i} marginBottom={1}>
                    {operationDef.render(c.operation, config, showInput, showOutput)}
                  </Box>
                );
              } else {
                return (
                  <Box key={i} marginBottom={1}>
                    <Text dimColor>
                      [{c.operation.type}] - [{c.operation.status}]
                    </Text>
                  </Box>
                );
              }
            } else {
              return (
                <Box key={i} marginBottom={1}>
                  <Markdown>{c.content}</Markdown>
                </Box>
              );
            }
          })}
        </Box>
      )}
    </Box>
  );
};
