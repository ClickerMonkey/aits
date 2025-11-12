import { Box, Text } from 'ink';
import React from 'react';
import type { Message } from '../schemas';
import { COLORS } from '../constants';
import { Operations } from '../operations/types';
import { ConfigFile } from '../config';

interface MessageDisplayProps {
  message: Message;
  config: ConfigFile;
}

/**
 * Parse inline markdown formatting and return text segments with styles
 */
const parseInlineFormatting = (text: string): Array<{ text: string; bold?: boolean; italic?: boolean; underline?: boolean }> => {
  const segments: Array<{ text: string; bold?: boolean; italic?: boolean; underline?: boolean }> = [];
  let remaining = text;
  let currentIndex = 0;

  // Find all formatting markers in order
  const markers: Array<{ index: number; type: 'bold' | 'italic' | 'underline'; isStart: boolean; length: number }> = [];

  // Find bold (**text**)
  let match;
  const boldRegex = /\*\*(.+?)\*\*/g;
  while ((match = boldRegex.exec(text)) !== null) {
    markers.push({ index: match.index, type: 'bold', isStart: true, length: 2 });
    markers.push({ index: match.index + match[0].length - 2, type: 'bold', isStart: false, length: 2 });
  }

  // Find italic (*text*)
  const italicRegex = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g;
  while ((match = italicRegex.exec(text)) !== null) {
    markers.push({ index: match.index, type: 'italic', isStart: true, length: 1 });
    markers.push({ index: match.index + match[0].length - 1, type: 'italic', isStart: false, length: 1 });
  }

  // Find underline (__text__)
  const underlineRegex = /__(.+?)__/g;
  while ((match = underlineRegex.exec(text)) !== null) {
    markers.push({ index: match.index, type: 'underline', isStart: true, length: 2 });
    markers.push({ index: match.index + match[0].length - 2, type: 'underline', isStart: false, length: 2 });
  }

  // If no formatting found, return plain text
  if (markers.length === 0) {
    return [{ text }];
  }

  // Sort markers by position
  markers.sort((a, b) => a.index - b.index);

  // Process text with formatting
  const activeFormats = { bold: false, italic: false, underline: false };
  let lastPos = 0;

  markers.forEach((marker) => {
    // Add text before this marker
    if (marker.index > lastPos) {
      const segment = text.substring(lastPos, marker.index);
      if (segment) {
        segments.push({ text: segment, ...activeFormats });
      }
    }

    // Toggle format
    if (marker.isStart) {
      activeFormats[marker.type] = true;
    } else {
      activeFormats[marker.type] = false;
    }

    lastPos = marker.index + marker.length;
  });

  // Add remaining text
  if (lastPos < text.length) {
    segments.push({ text: text.substring(lastPos), ...activeFormats });
  }

  return segments;
};

/**
 * Simple markdown-aware text renderer for Ink
 */
const MarkdownText: React.FC<{ children: string }> = ({ children }) => {
  const lines = children.split('\n');

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => {
        // Heading
        if (line.startsWith('# ')) {
          return <Text key={i} bold color={COLORS.MARKDOWN_HEADING}>{line.substring(2)}</Text>;
        }
        if (line.startsWith('## ')) {
          return <Text key={i} bold>{line.substring(3)}</Text>;
        }
        if (line.startsWith('### ')) {
          return <Text key={i} bold dimColor>{line.substring(4)}</Text>;
        }

        // Code block
        if (line.startsWith('```')) {
          return null; // Skip code fence markers for now
        }

        // Bullet list
        if (line.startsWith('- ') || line.startsWith('* ')) {
          const content = line.substring(2);
          const segments = parseInlineFormatting(content);
          return (
            <Box key={i}>
              <Text>  • </Text>
              {segments.map((seg, j) => (
                <Text key={j} bold={seg.bold} italic={seg.italic} underline={seg.underline}>
                  {seg.text}
                </Text>
              ))}
            </Box>
          );
        }

        // Numbered list
        const numberedMatch = line.match(/^(\d+\.\s)/);
        if (numberedMatch) {
          const prefix = numberedMatch[1];
          const content = line.substring(prefix.length);
          const segments = parseInlineFormatting(content);
          return (
            <Box key={i}>
              <Text>  {prefix}</Text>
              {segments.map((seg, j) => (
                <Text key={j} bold={seg.bold} italic={seg.italic} underline={seg.underline}>
                  {seg.text}
                </Text>
              ))}
            </Box>
          );
        }

        // Empty line
        if (line.trim() === '') {
          return <Text key={i}> </Text>;
        }

        // Regular text with inline formatting
        const segments = parseInlineFormatting(line);
        return (
          <Box key={i}>
            {segments.map((seg, j) => (
              <Text key={j} bold={seg.bold} italic={seg.italic} underline={seg.underline}>
                {seg.text}
              </Text>
            ))}
          </Box>
        );
      })}
    </Box>
  );
};

/**
 * Component for rendering a chat message with consistent styling
 */
export const MessageDisplay: React.FC<MessageDisplayProps> = ({ message, config }) => {
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

  return (
    <Box flexDirection="column" marginBottom={1} width="100%">
      <Box>
        <Text color={circleColor as any}>● </Text>
        <Text bold color={color}>
          {prefix}:
        </Text>
      </Box>
      {isUser ? (
        <Box borderStyle={'round'} flexDirection="column" paddingX={1} flexGrow={1} width={"100%"}>
          {message.content.map((part, i) => (
            <Text key={i}>&gt; {part.content}</Text>
          ))}
        </Box>
      ) : (
        <Box flexDirection="column" marginLeft={1}>
          {message.operations && message.operations.length > 0 && (
            <Box flexDirection="column" marginBottom={1}>
              {message.operations.map((op, i) => {
                const operationDef = Operations[op.type];
                if (operationDef?.render) {
                  return <React.Fragment key={i}>{operationDef.render(op, config)}</React.Fragment>;
                }
                return (
                  <Text key={i} dimColor>
                    [{op.type}] - [{op.status}]
                  </Text>
                );
              })}
            </Box>
          )}
          {message.content.map((part, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <Box>
                  <Text dimColor>{'─'.repeat(50)}</Text>
                </Box>
              )}
              <MarkdownText>{part.content}</MarkdownText>
            </React.Fragment>
          ))}
        </Box>
      )}
    </Box>
  );
};
