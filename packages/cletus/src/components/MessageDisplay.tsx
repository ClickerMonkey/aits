import { Box, Text } from 'ink';
import SyntaxHighlight from 'ink-syntax-highlight';
import Link from 'ink-link';
// import Markdown from 'ink-markdown';
import React from 'react';
import type { Message } from '../schemas';
import { COLORS } from '../constants';
import { Operations } from '../operations/types';
import { ConfigFile } from '../config';
import { logger } from '../logger';

interface MessageDisplayProps {
  message: Message;
  config: ConfigFile;
}

type LineSegment = { text: string; bold?: boolean; italic?: boolean; underline?: boolean, backgroundColor?: string, color?: string; url?: string };

/**
 * Parse inline markdown formatting and return text segments with styles
 */
const parseInlineFormatting = (text: string): LineSegment[] => {
  const segments: LineSegment[] = [];
  
  // Find all formatting markers in order
  const markers: Array<{ index: number; type: 'bold' | 'italic' | 'underline' | 'code' | 'link'; isStart: boolean; length: number }> = [];

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
  
  // Find code (`text`)
  const codeRegex = /`(.+?)`/g;
  while ((match = codeRegex.exec(text)) !== null) {
    markers.push({ index: match.index, type: 'code', isStart: true, length: 1 });
    markers.push({ index: match.index + match[0].length - 1, type: 'code', isStart: false, length: 1 });
  }

  // Find links [text](url) and treat as plain text for now
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = linkRegex.exec(text)) !== null) {
    markers.push({ index: match.index, type: 'link', isStart: true, length: 0 });
    markers.push({ index: match.index + match[0].length, type: 'link', isStart: false, length: 0 });
  }

  // If no formatting found, return plain text
  if (markers.length === 0) {
    return [{ text }];
  }

  // Sort markers by position
  markers.sort((a, b) => a.index - b.index);

  // Process text with formatting
  const activeFormats = { bold: false, italic: false, underline: false, code: false, link: false };
  let lastPos = 0;

  const addSegment = (text: string) => {
    if (activeFormats.code) {
      segments.push({ text, backgroundColor: COLORS.MARKDOWN_CODE_BACKGROUND });
    } else if (activeFormats.link) {
      const [, name, url] = text.match(/\[([^\]]+)\]\(([^)]+)\)/) || [];
      if (name && url) {
        segments.push({ text: name, url, underline: true, color: COLORS.MARKDOWN_LINK }); 
      } else {
        segments.push({ text, underline: true, color: COLORS.MARKDOWN_LINK });
      }
    } else {
      segments.push({ text, ...activeFormats });
    }
  };

  markers.forEach((marker) => {
    // Add text before this marker
    if (marker.index > lastPos) {
      const segment = text.substring(lastPos, marker.index);
      if (segment) {
        addSegment(segment);
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
    addSegment(text.substring(lastPos));
  }

  return segments;
};

/**
 * Simple markdown-aware text renderer for Ink
 */
const MarkdownText: React.FC<{ children: string }> = ({ children }) => {
  const lines = children.split('\n');

  // Break up into code and non-code sections
  type GroupType = 'code' | 'text';
  type Group = { type: GroupType; language?: string; padding: number, content: string[] };

  const groups: Group[] = [];
  let currentGroup: Group | null = null;
  let inCodeBlock = false;
  lines.forEach((line) => {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) {
        const language = line.trim().substring(3).trim() || undefined;
        currentGroup = { type: 'code', language, content: [], padding: line.indexOf('`') };
        groups.push(currentGroup);
      } else {
        currentGroup = null;
      }
    } else {
      if (inCodeBlock) {
        currentGroup!.content.push(line);
      } else {
        if (currentGroup && currentGroup.type === 'text') {
          currentGroup.content.push(line);
        } else {
          currentGroup = { type: 'text', content: [line], padding: 0 };
          groups.push(currentGroup);
        }
      }
    }
  });  

  return (
    <Box flexDirection="column">
      {groups.map((group, gi) => {
        if (group.type === 'code') {
          return (
            <SyntaxHighlight code={group.content.join('\n')} language={group.language} key={gi} />
          );
        } else {
          return group.content.map((line, i) => {
            // Heading
            const headingMatch = line.match(/^(\s*)([#]+)\s+(.*)/);
            if (headingMatch) {
              const [, leadingSpaces, hashes, headingText] = headingMatch;
              const level = Math.min(hashes.length - 1, COLORS.MAKRDOWN_HEADINGS.length - 1);
              const style = COLORS.MAKRDOWN_HEADINGS[level];
              if (leadingSpaces) {
                return (
                  <Box key={i} marginLeft={leadingSpaces.length}>
                    <Text {...style}>{headingText}</Text>
                  </Box>
                );
              } else {
                return <Text key={i} {...style}>{headingText}</Text>;
              }
            }

            // Code block
            if (line.startsWith('```')) {
              return null; // Skip code fence markers for now
            }

            // Bullet list
            if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
              line = line.replace(/^(\s*)([-*])(\s+)/, '$1•$3')
            }

            // Empty line
            if (line.trim() === '') {
              return <Text key={i}> </Text>;
            }

            // Regular text with inline formatting
            const segments = parseInlineFormatting(line);
            return (
              <Box key={i} flexWrap='wrap'>
                <Text>
                {segments.map((seg, j) => (
                  <>
                    {seg.url ? (
                      <Link key={j} url={seg.url}>
                        <Text bold={seg.bold} italic={seg.italic} underline={seg.underline} backgroundColor={seg.backgroundColor} color={seg.color}>
                          {seg.text}
                        </Text>
                      </Link>
                    ) : (
                      <Text key={j} bold={seg.bold} italic={seg.italic} underline={seg.underline} backgroundColor={seg.backgroundColor} color={seg.color}>
                        {seg.text}
                      </Text>
                    )}
                  </>
                ))}
                </Text>
              </Box>
            );
          });
        }
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
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={circleColor as any}>● </Text>
        <Text bold color={color}>
          {prefix}:
        </Text>
      </Box>
      {isUser ? (
        <Box borderStyle={'round'} flexDirection="column" paddingX={1}>
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
