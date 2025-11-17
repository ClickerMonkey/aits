import { Box, Text } from "ink";
import SyntaxHighlight from "ink-syntax-highlight";
import React from 'react';
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
/**
 * Recursively render content that may contain markdown, including nested block quotes
 */
const renderMarkdownContent = (content: string, nestingLevel: number = 0): React.ReactNode[] => {
  const lines = content.split('\n');
  const result: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Detect code block
    if (line.trim().startsWith('```')) {
      const language = line.trim().substring(3).trim() || undefined;
      const codeLines: string[] = [];
      let j = i + 1;
      
      // Collect code block content
      while (j < lines.length && !lines[j].trim().startsWith('```')) {
        codeLines.push(lines[j]);
        j++;
      }
      
      // Render the code block
      result.push(
        <SyntaxHighlight key={`code-${i}`} code={codeLines.join('\n')} language={language} />
      );
      
      i = j + 1; // Skip the closing ```
      continue;
    }

    // Detect block quote with nesting level
    const blockquoteMatch = line.match(/^((?:>\s?)+)(.*)$/);
    if (blockquoteMatch) {
      const [, quoteMarkers, quoteText] = blockquoteMatch;
      const quoteLevel = (quoteMarkers.match(/>/g) || []).length;
      
      // Collect all consecutive lines at the same or deeper quote level
      const blockLines: string[] = [quoteText];
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        const nextMatch = nextLine.match(/^((?:>\s?)+)(.*)$/);
        if (nextMatch) {
          const nextQuoteLevel = (nextMatch[1].match(/>/g) || []).length;
          if (nextQuoteLevel >= quoteLevel) {
            // Remove the outer quote level markers
            const remainingMarkers = '> '.repeat(nextQuoteLevel - quoteLevel);
            blockLines.push(remainingMarkers + nextMatch[2]);
            j++;
          } else {
            break;
          }
        } else {
          // Empty line or non-quote line breaks the block
          break;
        }
      }

      // Render the block quote
      result.push(
        <Box 
          key={`blockquote-${i}`} 
          marginLeft={nestingLevel * 2}
          paddingLeft={1}
          paddingRight={1}
          backgroundColor="rgb(40,40,40)"
        >
          <Box paddingRight={1} borderLeft borderColor={COLORS.MARKDOWN_BLOCKQUOTE}>
            <Text> </Text>
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            {renderMarkdownContent(blockLines.join('\n'), nestingLevel + 1)}
          </Box>
        </Box>
      );

      i = j;
      continue;
    }

    // Detect markdown table
    const isTableRow = line.trim().match(/^\|(.+)\|$/);
    if (isTableRow) {
      // Collect all consecutive table rows
      const tableLines: string[] = [line];
      let j = i + 1;
      while (j < lines.length && lines[j].trim().match(/^\|(.+)\|$/)) {
        tableLines.push(lines[j]);
        j++;
      }

      // Parse and render the table
      result.push(renderTable(tableLines, i));
      i = j;
      continue;
    }

    // Render regular line
    result.push(renderLine(line, i, nestingLevel));
    i++;
  }

  return result;
};

/**
 * Split table row by pipes, handling escaped pipes (\|)
 */
const splitTableCells = (line: string): string[] => {
  const cells: string[] = [];
  let currentCell = '';
  let i = 0;
  
  while (i < line.length) {
    if (line[i] === '\\' && i + 1 < line.length && line[i + 1] === '|') {
      // Escaped pipe - add the pipe to the cell
      currentCell += '|';
      i += 2;
    } else if (line[i] === '|') {
      // Unescaped pipe - cell separator
      cells.push(currentCell.trim());
      currentCell = '';
      i++;
    } else {
      currentCell += line[i];
      i++;
    }
  }
  
  // Add the last cell
  if (currentCell || cells.length > 0) {
    cells.push(currentCell.trim());
  }
  
  // Filter out empty first/last cells (from leading/trailing pipes)
  return cells.filter((cell, idx) => cell !== '' || (idx !== 0 && idx !== cells.length - 1));
};

/**
 * Render a markdown table
 */
const renderTable = (tableLines: string[], key: number): React.ReactNode => {
  if (tableLines.length < 2) return null;

  // Parse header
  const headerCells = splitTableCells(tableLines[0]);

  // Parse separator (second line) to detect alignment
  const separatorCells = splitTableCells(tableLines[1]);
  
  const alignments = separatorCells.map(sep => {
    if (sep.startsWith(':') && sep.endsWith(':')) return 'center';
    if (sep.endsWith(':')) return 'right';
    return 'left';
  });

  // Parse data rows
  const dataRows = tableLines.slice(2).map(line => splitTableCells(line));

  // Calculate column widths
  const colWidths = headerCells.map((header, colIdx) => {
    const headerWidth = header.length;
    const dataWidths = dataRows.map(row => (row[colIdx] || '').length);
    const dataWidth = dataWidths.length > 0 ? Math.max(...dataWidths) : 0;
    return Math.max(headerWidth, dataWidth, 3) + 2; // +2 for padding
  });

  return (
    <Box key={`table-${key}`} flexDirection="column" marginTop={1} marginBottom={1}>
      {/* Header row */}
      <Box>
        {headerCells.map((header, colIdx) => {
          const segments = parseInlineFormatting(header);
          return (
            <Box key={colIdx} width={colWidths[colIdx]} paddingLeft={1} paddingRight={1}>
              <Text bold>
                {segments.map((seg, segIdx) => (
                  <Text 
                    key={segIdx}
                    bold={seg.bold || true}
                    italic={seg.italic}
                    underline={seg.underline}
                    strikethrough={seg.strikethrough}
                    backgroundColor={seg.backgroundColor}
                    color={seg.color}
                  >
                    {seg.text}
                  </Text>
                ))}
              </Text>
            </Box>
          );
        })}
      </Box>
      
      {/* Separator line */}
      <Box>
        {headerCells.map((_, colIdx) => (
          <Box key={colIdx} width={colWidths[colIdx]}>
            <Text color="gray">{'─'.repeat(colWidths[colIdx])}</Text>
          </Box>
        ))}
      </Box>

      {/* Data rows */}
      {dataRows.map((row, rowIdx) => (
        <Box key={rowIdx}>
          {row.map((cell, colIdx) => {
            const segments = parseInlineFormatting(cell);
            const alignment = alignments[colIdx] || 'left';
            return (
              <Box 
                key={colIdx} 
                width={colWidths[colIdx]} 
                paddingLeft={1} 
                paddingRight={1}
                justifyContent={alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'flex-start'}
              >
                <Text>
                  {segments.map((seg, segIdx) => (
                    <Text 
                      key={segIdx}
                      bold={seg.bold}
                      italic={seg.italic}
                      underline={seg.underline}
                      strikethrough={seg.strikethrough}
                      backgroundColor={seg.backgroundColor}
                      color={seg.color}
                    >
                      {seg.text}
                    </Text>
                  ))}
                </Text>
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
};

/**
 * Render a single line of markdown
 */
const renderLine = (line: string, key: number, nestingLevel: number = 0): React.ReactNode => {
  // Heading
  const headingMatch = line.match(/^(\s*)([#]+)\s+(.*)/);
  if (headingMatch) {
    const [, leadingSpaces, hashes, headingText] = headingMatch;
    const level = Math.min(hashes.length - 1, COLORS.MAKRDOWN_HEADINGS.length - 1);
    const style = COLORS.MAKRDOWN_HEADINGS[level];
    if (leadingSpaces) {
      return (
        <Box key={key} marginLeft={leadingSpaces.length}>
          <Text {...style}>{headingText}</Text>
        </Box>
      );
    } else {
      return <Text key={key} {...style}>{headingText}</Text>;
    }
  }
  
  // Code block markers (skip them)
  if (line.startsWith('```')) {
    return null;
  }
  
  // Bullet list
  if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
    line = line.replace(/^(\s*)([-*])(\s+)/, '$1•$3')
  }
  
  // Empty line
  if (line.trim() === '') {
    return <Text key={key}> </Text>;
  }
  
  // Regular text with inline formatting
  const segments = parseInlineFormatting(line);

  return (
    <Box key={key} flexWrap='wrap'>
      {segments.map((seg, j) => {
        if (seg.url) {
          return <Link key={j} url={seg.url}>{seg.text}</Link>;
        } else {
          return (
            <Text key={j} bold={seg.bold} italic={seg.italic} underline={seg.underline} strikethrough={seg.strikethrough} backgroundColor={seg.backgroundColor} color={seg.color}>
              {seg.text}
            </Text>
          );
        }
      })}
    </Box>
  );
};

export const Markdown: React.FC<{ children: string }> = ({ children }) => {
  return (
    <Box flexDirection="column">
      {renderMarkdownContent(children)}
    </Box>
  );
};