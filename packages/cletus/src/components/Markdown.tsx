import { Message } from "@aits/core";
import { Box, Text } from "ink";
import Link from "ink-link";
import SyntaxHighlight from "ink-syntax-highlight";
import React from 'react';
import { ConfigFile } from "../config";
import { COLORS } from "../constants";

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
export const Markdown: React.FC<{ children: string }> = ({ children }) => {
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