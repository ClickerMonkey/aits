import { Box, Text, TextProps } from "ink";
import SyntaxHighlight from "ink-syntax-highlight";
import React from 'react';
import { COLORS } from "../constants";
import { Link } from "./Link";
import { logger } from "../logger";

type LineSegment = { text: string;  url?: string; styles?: { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; backgroundColor?: string, color?: string; } };

/**
* Parse inline markdown formatting and return text segments with styles
* Priority: code and links are extracted first, then formatting is applied to remaining text
*/
const parseInlineFormatting = (text: string): LineSegment[] => {
  if (!text) return [];

  // Step 1: Find all code segments (highest priority)
  const codeSegments: Array<{ start: number; end: number; content: string }> = [];
  const codeRegex = /`(([^`]|\\`)+)`/g;
  let match;
  while ((match = codeRegex.exec(text)) !== null) {
    codeSegments.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[1].replace(/\\`/g, '`') // Unescape backticks
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
      segment: { text: code.content, styles:{ backgroundColor: COLORS.MARKDOWN_CODE_BACKGROUND } }
    });
  }

  for (const link of linkSegments) {
    protectedRanges.push({
      start: link.start,
      end: link.end,
      segment: { text: link.text, url: link.url }
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

  let match;
  
  // Find bold (**text**) - check first to handle ***text*** correctly
  const boldRegex = /\*\*(.+?)\*\*/g;
  while ((match = boldRegex.exec(text)) !== null) {
    markers.push({ index: match.index, type: 'bold', isStart: true, length: 2 });
    markers.push({ index: match.index + match[0].length - 2, type: 'bold', isStart: false, length: 2 });
  }

  // Find italic - single * or _ (but not part of ** or __)
  // Use negative lookbehind/lookahead to avoid matching doubled delimiters
  const italicRegex = /(?<!\*)(\*)(?!\*)(.+?)(?<!\*)(\*)(?!\*)|(?<!_)(_)(?!_)(.+?)(?<!_)(_)(?!_)/g;
  while ((match = italicRegex.exec(text)) !== null) {
    // match[1] and match[2] for *, match[4] and match[5] for _
    const startIndex = match[1] ? match.index : match.index;
    const content = match[2] || match[5];
    markers.push({ index: startIndex, type: 'italic', isStart: true, length: 1 });
    markers.push({ index: startIndex + content.length + 1, type: 'italic', isStart: false, length: 1 });
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
  const activeStyles = { bold: false, italic: false, underline: false, strikethrough: false };
  let lastPos = 0;

  markers.forEach((marker) => {
    // Add text before this marker
    if (marker.index > lastPos) {
      const segment = text.substring(lastPos, marker.index);
      if (segment) {
        segments.push({ text: segment, styles: { ...activeStyles } });
      }
    }

    // Toggle format
    activeStyles[marker.type] = marker.isStart;
    lastPos = marker.index + marker.length;
  });

  // Add remaining text
  if (lastPos < text.length) {
    const segment = text.substring(lastPos);
    if (segment) {
      segments.push({ text: segment, styles: { ...activeStyles } });
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
        <Box key={`codeblock-${i}`} flexGrow={1} backgroundColor={COLORS.MARKDOWN_CODE_BACKGROUND} paddingX={1}>
          <SyntaxHighlight key={`code-${i}`} code={codeLines.join('\n')} language={language} />
        </Box>
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
          marginLeft={nestingLevel}
          paddingLeft={1}
          paddingRight={1}
          backgroundColor={COLORS.MARKDOWN_BLOCKQUOTE}
          borderStyle='bold'
          borderLeft={true}
          borderTop={false}
          borderBottom={false}
          borderRight={false}
          flexGrow={1}
          flexDirection='column'
        >
          {renderMarkdownContent(blockLines.join('\n'), nestingLevel + 1)}
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

    // Detect horizontal rule
    if (line.trim().match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      result.push(
        <Box key={`hr-${i}`} width="100%" borderStyle="bold" borderBottom borderTop={false} borderLeft={false} borderRight={false} borderBottomDimColor />
      );  
      i++;
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
  const columnWidths = headerCells.map((header, colIdx) => {
    const headerWidth = header.length;
    const dataWidths = dataRows.map(row => (row[colIdx] || '').length);
    const dataWidth = dataWidths.length > 0 ? Math.max(...dataWidths) : 0;
    return Math.max(headerWidth, dataWidth, 3);
  });

  const minWidth = Math.min(...columnWidths);
  const maxAllowedWidth = minWidth * 3; // max ratio
  const constrainedWidths = columnWidths.map(x => Math.min(x, maxAllowedWidth));
  const totalWidth = constrainedWidths.reduce((sum, w) => sum + w, 0);
  const percentages = constrainedWidths.map(w => (w / totalWidth) * 100);

  // ┌─┬─┐
  // │ │ │
  // ├─┼─┤
  // └─┴─┘

  const getStyles = (firstX: boolean, firstY: boolean, lastX: boolean, lastY: boolean) => {
    return {
      topLeft: firstX && firstY ? '┌' : firstY ? '┬' : firstX ? '├' : '┼',
      top: '─',
      topRight: lastX && firstY ? '┐' : firstY ? '┬' : lastX ? '┤' : '┼',
      right: '│',
      bottomRight: lastX && lastY ? '┘' : lastY ? '┴' : lastX ? '┤' : '┼',
      bottom: '─',
      bottomLeft: firstX && lastY ? '└' : lastY ? '┴' : firstX ? '├' : '┼',
      left: '│',
    };
  }

  return (
    <Box flexDirection="column" width="100%" key={`table-${key}`} >
      {/* Header Row */}
      <Box width="100%" key="header">
        {headerCells.map((header, i) => (
          <Box 
            key={i}
            width={`${percentages[i]}%`}
            borderStyle={getStyles(i === 0, true, i === headerCells.length - 1, false)}
            borderLeft={i === 0}
            borderRight
            borderTop
            borderBottom
            paddingX={1}
          >
            <Text bold wrap="wrap">{renderInline(header)}</Text>
          </Box>
        ))}
      </Box>
      
      {/* Data Rows */}
      {dataRows.map((row, rowIndex) => (
        <Box key={rowIndex} width="100%">
          {row.map((col, i) => (
            <Box 
              key={i}
              width={`${percentages[i]}%`}
              borderStyle={getStyles(i === 0, false, i === row.length - 1, rowIndex === dataRows.length - 1)}
              borderLeft={i === 0}
              borderRight
              borderBottom
              borderTop={false}
              paddingX={1}
              justifyContent={alignments[i] === 'center' ? 'center' : alignments[i] === 'right' ? 'flex-end' : 'flex-start'}
            >
              <Text wrap="wrap">{renderInline(col)}</Text>
            </Box>
          ))}
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
  return (
    <Box key={key} flexWrap='wrap'>
      {renderInline(line)}
    </Box>
  );
};

/**
 * Render text with inline formatting
 * 
 * @param line - text line to render
 * @param props - additional TextProps
 * @returns Text component with formatting applied
 */
const renderInline = (line: string, props?: TextProps) => {
  const segments = parseInlineFormatting(line);

  return (
    <Text {...props}>
      {segments.map((seg, j) => (
        seg.url ? (
          <Link key={j} url={seg.url}>{seg.text}</Link>
        ) : (
          <Text key={j} {...seg.styles}>
            {seg.text}
          </Text>
        )
      ))}
    </Text>
  );
};

/**
 *
 * @param param0 
 * @returns 
 */
export const Markdown: React.FC<{ children: string }> = ({ children }) => {
  return (
    <Box flexDirection="column">
      {renderMarkdownContent(children)}
    </Box>
  );
};