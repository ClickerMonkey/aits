import { Box, Text } from "ink";
import SyntaxHighlight from "ink-syntax-highlight";
import React from 'react';
import { chunk } from '../common';
import { COLORS } from "../constants";
import { Link } from "./Link";

type LineSegment = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; backgroundColor?: string, color?: string; url?: string };

/**
* Parse inline markdown formatting and return text segments with styles
* Priority: code and links are extracted first, then formatting is applied to remaining text
*/
const parseInlineFormatting = (text: string): LineSegment[] => {
  if (!text) return [];

  // Step 1: Find all code segments (highest priority)
  const codeSegments: Array<{ start: number; end: number; content: string }> = [];
  const codeRegex = /`([^`]+)`/g;
  let match;
  while ((match = codeRegex.exec(text)) !== null) {
    codeSegments.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[1]
    });
  }

  // Step 2: Find all link segments (second priority)
  const linkSegments: Array<{ start: number; end: number; text: string; url: string }> = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = linkRegex.exec(text)) !== null) {
    linkSegments.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[1],
      url: match[2]
    });
  }

  // Step 3: Create a map of protected ranges (code and links)
  const protectedRanges: Array<{ start: number; end: number; segment: LineSegment }> = [];

  for (const code of codeSegments) {
    protectedRanges.push({
      start: code.start,
      end: code.end,
      segment: { text: code.content, backgroundColor: COLORS.MARKDOWN_CODE_BACKGROUND }
    });
  }

  for (const link of linkSegments) {
    protectedRanges.push({
      start: link.start,
      end: link.end,
      segment: { text: link.text, url: link.url, underline: true, color: COLORS.MARKDOWN_LINK }
    });
  }

  // Sort protected ranges by start position
  protectedRanges.sort((a, b) => a.start - b.start);

  // Step 4: Identify formattable ranges (text not in code or links)
  const formattableRanges: Array<{ start: number; end: number }> = [];
  let lastEnd = 0;

  for (const range of protectedRanges) {
    if (range.start > lastEnd) {
      formattableRanges.push({ start: lastEnd, end: range.start });
    }
    lastEnd = range.end;
  }

  if (lastEnd < text.length) {
    formattableRanges.push({ start: lastEnd, end: text.length });
  }

  // Step 5: Apply formatting (bold, italic, underline, strikethrough) to formattable ranges
  const formattedRanges: Array<{ start: number; segments: LineSegment[] }> = [];

  for (const range of formattableRanges) {
    const rangeText = text.substring(range.start, range.end);
    const segments = applyFormatting(rangeText);
    formattedRanges.push({ start: range.start, segments });
  }

  // Step 6: Merge all segments in order
  const allRanges: Array<{ start: number; segments: LineSegment[] }> = [];

  for (const range of protectedRanges) {
    allRanges.push({ start: range.start, segments: [range.segment] });
  }

  allRanges.push(...formattedRanges);
  allRanges.sort((a, b) => a.start - b.start);

  return allRanges.flatMap(r => r.segments);
};

/**
* Apply bold, italic, underline, and strikethrough formatting to text
*/
const applyFormatting = (text: string): LineSegment[] => {
  const segments: LineSegment[] = [];
  const markers: Array<{ index: number; type: 'bold' | 'italic' | 'underline' | 'strikethrough'; isStart: boolean; length: number }> = [];

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

  // Find strikethrough (~~text~~)
  const strikethroughRegex = /~~(.+?)~~/g;
  while ((match = strikethroughRegex.exec(text)) !== null) {
    markers.push({ index: match.index, type: 'strikethrough', isStart: true, length: 2 });
    markers.push({ index: match.index + match[0].length - 2, type: 'strikethrough', isStart: false, length: 2 });
  }

  // If no formatting found, return plain text
  if (markers.length === 0) {
    return [{ text }];
  }

  // Sort markers by position
  markers.sort((a, b) => a.index - b.index);

  // Process text with formatting
  const activeFormats = { bold: false, italic: false, underline: false, strikethrough: false };
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
    const segment = text.substring(lastPos);
    if (segment) {
      segments.push({ text: segment, ...activeFormats });
    }
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
          <SyntaxHighlight key={gi} code={group.content.join('\n')} language={group.language} />
        );
      } else {
        return (
          <React.Fragment key={gi}>
            {group.content.map((line, i) => {
              // Block quote
              const blockquoteMatch = line.match(/^(\s*)>\s+(.*)$/);
              if (blockquoteMatch) {
                const [, leadingSpaces, quoteText] = blockquoteMatch;
                const segments = parseInlineFormatting(quoteText);
                const segmentsGrouped = chunk(segments, (a, b) => !a.url !== !b.url);

                return (
                  <Box key={i} marginLeft={(leadingSpaces?.length || 0) + 2} borderStyle='single' borderLeft={true} borderColor={COLORS.MARKDOWN_BLOCKQUOTE} paddingLeft={1}>
                    <Text color={COLORS.MARKDOWN_BLOCKQUOTE}>
                      {segmentsGrouped.map((segGroup, j) => {
                        if (segGroup[0].url) {
                          return (
                            <React.Fragment key={j}>
                              {segGroup.map((seg, k) => (
                                <Link key={k} url={seg.url!}>{seg.text}</Link>
                              ))}
                            </React.Fragment>
                          );
                        } else {
                          return (
                            <React.Fragment key={j}>
                              {segGroup.map((seg, k) => (
                                <Text key={k} bold={seg.bold} italic={seg.italic} underline={seg.underline} strikethrough={seg.strikethrough} backgroundColor={seg.backgroundColor}>
                                  {seg.text}
                                </Text>
                              ))}
                            </React.Fragment>
                          );
                        }
                      })}
                    </Text>
                  </Box>
                );
              }

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
              const segmentsGrouped = chunk(segments, (a, b) => !a.url !== !b.url);

              return (
                <Box key={i} flexWrap='wrap'>
                  {segmentsGrouped.map((segGroup, j) => {
                    if (segGroup[0].url) {
                      return (
                        <React.Fragment key={j}>
                          {segGroup.map((seg, k) => (
                            <Link key={k} url={seg.url!}>{seg.text}</Link>
                          ))}
                        </React.Fragment>
                      );
                    } else {
                      return (
                        <Text key={j}>
                          {segGroup.map((seg, k) => (
                            <Text key={k} bold={seg.bold} italic={seg.italic} underline={seg.underline} strikethrough={seg.strikethrough} backgroundColor={seg.backgroundColor} color={seg.color}>
                              {seg.text}
                            </Text>
                          ))}
                        </Text>
                      );
                    }
                  })}
                </Box>
              );
            })}
          </React.Fragment>
        );
      }
    })}
    </Box>
  );
};