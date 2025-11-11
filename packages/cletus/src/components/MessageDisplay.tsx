import { Box, Text } from 'ink';
import React from 'react';
import type { Message } from '../schemas.js';

interface MessageDisplayProps {
  message: Message;
}

/**
 * Component for rendering a chat message with consistent styling
 */
export const MessageDisplay: React.FC<MessageDisplayProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const color =
    message.role === 'user' ? 'green' : message.role === 'system' ? 'yellow' : 'blue';

  const prefix =
    message.role === 'user'
      ? `${message.name || 'You'}`
      : message.role === 'system'
        ? 'System'
        : `${message.name ?? 'Assistant'}`;

  return (
    <Box flexDirection="column" marginBottom={1} width="100%">
      <Text bold color={color}>
        {prefix}:
      </Text>
      {isUser ? (
        <Box borderStyle={'round'} flexDirection="column" width="100%">
          {message.content.map((part, i) => (
            <Text key={i}> &gt; {part.content}</Text>
          ))}
        </Box>
      ) : (
        <Box flexDirection="column" marginLeft={1}>
          {message.operations && message.operations.length > 0 && (
            <Box flexDirection="column" marginBottom={1}>
              {message.operations.map((op, i) => (
                <Text key={i} dimColor>
                  [{op.type}] - [{op.status}]
                </Text>
              ))}
            </Box>
          )}
          {message.content.map((part, i) => (
            <Text key={i}>{part.content}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
};
