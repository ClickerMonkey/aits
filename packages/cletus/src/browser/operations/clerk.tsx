import React from 'react';
import { CONSTS } from '../../constants';
import { abbreviate, chunk, paginateText, pluralize } from '../../shared';
import { createRenderer, linkFile } from './render';


const renderer = createRenderer({
  borderColor: "border-neon-green/30",
  bgColor: "bg-neon-green/5",
  labelColor: "text-neon-green",
});

export const file_search = renderer<'file_search'>(
  (op) => `Files("${op.input.glob}", "${op.input.glob}")`,
  (op) => {
    if (op.output) {
      return `Found ${pluralize(op.output.count, 'file')}`;
    }
    return null;
  },
);

export const file_summary = renderer<'file_summary'>(
  (op) => `Summarize("${paginateText(op.input.path, 100, -100)}")`,
  (op) => {
    if (op.output) {
      return `${linkFile(op.output.fullPath)}: ${abbreviate(op.output.summary, 60)}`;
    }
    return null;
  },
);

export const file_index = renderer<'file_index'>(
  (op) => `Index("${op.input.glob}", ${op.input.index})`,
  (op) => {
    // Use cache for consistent rendering even if files change
    const fileCount = op.cache?.indexableFiles?.length ?? op.output?.files.length;
    if (fileCount !== undefined) {
      const knowledgeCount = op.output?.knowledge;
      if (knowledgeCount !== undefined) {
        return `Indexed **${pluralize(fileCount, 'file')}**, **${pluralize(knowledgeCount, 'knowledge entry', 'knowledge entries')}**`;
      }
      return `Will index **${pluralize(fileCount, 'file')}**`;
    }
    return null;
  }
);

export const file_create = renderer<'file_create'>(
  (op) => `Write("${paginateText(op.input.path, 100, -100)}")`,
  (op) => {
    if (op.output) {
      return `Created ${linkFile(op.output.fullPath)} with **${op.output.size.toLocaleString()}** characters, **${op.output.lines}** lines`;
    }
    return null;
  }
);

export const file_copy = renderer<'file_copy'>(
  (op) => `Copy("${op.input.glob}", "${op.input.target}")`,
  (op) => {
    // Use cache for consistent rendering
    const count = op.cache?.sourceFiles?.length ?? op.output?.source?.length;
    const fullTarget = op.cache?.fullTarget ?? op.output?.fullTarget;
    if (count !== undefined) {
      return op.output 
        ? `Copied ${pluralize(count, 'file')} to ${fullTarget ? linkFile(fullTarget) : op.input.target}`
        : `Will copy ${pluralize(count, 'file')} to ${fullTarget ? linkFile(fullTarget) : op.input.target}`;
    }
    return null;
  }
);

export const file_move = renderer<'file_move'>(
  (op) => `Move("${op.input.glob}" → "${op.input.target}")`,
  (op) => {
    // Use cache for consistent rendering
    const files = op.cache?.files ?? op.output?.files;
    const targetPath = op.cache?.targetPath ?? op.output?.targetPath;
    if (files) {
      const count = files.length;
      return op.output
        ? `Moved ${pluralize(count, 'file')} to ${targetPath ? linkFile(targetPath) : op.input.target}`
        : `Will move ${pluralize(count, 'file')} to ${targetPath ? linkFile(targetPath) : op.input.target}`;
    }
    return null;
  }
);

export const file_stats = renderer<'file_stats'>(
  (op) => `FileStats("${paginateText(op.input.path, 100, -100)}")`,
  (op) => {
    if (op.output) {
      const sizeKB = (op.output.size / 1024).toFixed(1);
      return `${linkFile(op.output.fullPath)}: **${op.output.type}**, **${sizeKB} KB**${op.output.lines ? `, **${op.output.lines}** lines` : ''}`;
    }
    return null;
  }
);

export const file_delete = renderer<'file_delete'>(
  (op) => `Delete("${paginateText(op.input.path, 100, -100)}")`,
  (op) => {
    if (op.output) {
      return `Deleted ${op.input.path}`;
    }
    return null;
  }
);

export const file_read = renderer<'file_read'>(
  (op) => `Read("${paginateText(op.input.path, 100, -100)}")`,
  (op) => {
    if (op.output) {
      const params: string[] = [];

      // Add limit/offset info if non-default
      const limitOffsetMode = op.input.limitOffsetMode || 'characters';
      const defaultLimit = limitOffsetMode === 'characters' ? CONSTS.MAX_CHARACTERS : CONSTS.MAX_LINES;
      if (op.input.limit && op.input.limit !== defaultLimit) {
        params.push(`limit=${op.input.limit} ${limitOffsetMode}`);
      }
      if (op.input.offset) {
        params.push(`offset=${op.input.offset}`);
      }
      if (op.input.limitOffsetMode && op.input.limitOffsetMode !== 'characters') {
        params.push(`mode=${op.input.limitOffsetMode}`);
      }

      // Add boolean flags if enabled
      if (op.input.showLines) params.push('lines');
      if (op.input.describeImages) params.push('describe');
      if (op.input.extractImages) params.push('extract');
      if (op.input.transcribeImages) params.push('transcribe');

      const paramsStr = params.length > 0 ? ` (${params.join(', ')})` : '';
      return `Read ${linkFile(op.output.fullPath)}: **${op.output.content.length.toLocaleString()}** characters${op.output.truncated ? ' *(truncated)*' : ''}${paramsStr}`;
    }
    return null;
  }
);

export const file_edit = renderer<'file_edit'>(
  (op) => `Edit("${paginateText(op.input.path, 100, -100)}")`,
  (op) => {
    if (op.cache?.changed === false) {
      return 'No changes';
    }
    
    // diff format:
    // Index: [filename]
    // ===================================================================
    // --- [filename]     before
    // +++ [filename]     after
    // @@ -old_index,old_lines +new_index,new_lines @@
    // [+- ]line
    // \ ignore
    const lineClasses = {
      '+': 'bg-green-900/30 text-green-300',
      '-': 'bg-red-900/30 text-red-300',
      ' ': 'text-muted-foreground',
    } as const;

    // render format:
    // [gray line number] [+- ] content
    // ... divider
    let additions = 0;
    let subtractions = 0;
    const diff = op.cache?.diff || op.output || op.analysis || '';
    const diffLines = diff.split('\n');
    const relevantLines = diffLines.slice(4).filter(line => !line.startsWith('\\'));
    const changeSetLines = chunk(relevantLines, (_, line) => line.startsWith('@@'));
    const changeSets = changeSetLines.map((setLines, setLinesIndex) => {
      const [, lineStartText, lineCountText] = /^@@ -\d+,\d+ \+(\d+),(\d+) @@$/.exec(setLines[0]) || [];
      const lineStart = parseInt(lineStartText, 10);
      const lineCount = parseInt(lineCountText, 10);
      const linePadding = (lineStart + lineCount).toString().length + 1;
      const lines = setLines.slice(1);
      const lineNumbers: string[] = [];
      let currentLineNumber = lineStart;
      let removed = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('-')) {
          removed++;
          subtractions++;
        } else if (line.startsWith('+')) {
          currentLineNumber -= removed;
          removed = 0;
          additions++;
        }
        lineNumbers.push(currentLineNumber.toFixed(0).padStart(linePadding, ' '));
        currentLineNumber++;
      }
      // Trim empty lines at start and end
      while (lines.length > 0 && lines[0].trim() === '') {
        lines.shift();
        lineNumbers.shift();
      }
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
        lineNumbers.pop();
      }

      return (
        <div key={setLinesIndex}>
          {lines.map((line, lineIndex) => (
            <div key={lineIndex} className=''>
              <div color="gray">{lineNumbers[lineIndex]} </div>
              <div className={lineClasses[line[0] as '+' | '-' | ' ']}>
                {line}
              </div>
            </div>
          ))}
        </div>
      );
    });

    const changeSetsGrouped = changeSets.map((set, index) => (
      <React.Fragment key={index}>
        {index > 0 && (<div>...</div>)}
        {set}
      </React.Fragment>
    ));

    // React Web Version:
    return (
      <div>
        <span className="text-foreground">→ </span>
        <span>
          {op.output ? 'Updated ' : op.analysis ? 'Edit ' : 'Analyzing '}
          <span className="text-neon-cyan">{op.input.path}</span>
          {diff && (additions + subtractions) > 0 && (
            <span>
              {' '}with {pluralize(additions, 'addition')} and {pluralize(subtractions, 'removal')}
            </span>
          )}
        </span>
        {changeSetsGrouped}
      </div>
    );
  },
  (op) => ({
    borderColor: op.output ? 'border-border' : op.status === 'rejected' ? 'border-muted' : 'border-green-500/30',
    bgColor: op.output ? 'bg-card/50' : op.status === 'rejected' ? 'bg-muted/20' : 'bg-green-500/5',
  })
);

export const text_search = renderer<'text_search'>(
  (op) => `Search("${abbreviate(op.input.regex, 20)}", "${op.input.glob}")`,
  (op) => {
    // Use cache for consistent rendering when results are available
    const searchedCount = op.cache?.searchableFiles?.length ?? op.output?.searched;
    if (op.output) {
      const output = op.output;
      if (output.fileCount !== undefined) {
        return `Found ${pluralize(output.fileCount, 'file')} (searched ${searchedCount ?? output.searched})`;
      } else if (output.matchCount !== undefined) {
        return `Found ${pluralize(output.matchCount, 'match', 'matches')} (searched ${pluralize(searchedCount ?? output.searched ?? 0, 'file')})`;
      } else if (output.matches) {
        return `Found matches in ${pluralize(output.matches.length, 'file')}`;
      } else {
        return `Searched ${pluralize(searchedCount ?? output.searched ?? 0, 'file')}`;
      }
    } else if (searchedCount !== undefined) {
      return `Will search ${pluralize(searchedCount, 'file')}`;
    }
    return null;
  }
);

export const dir_create = renderer<'dir_create'>(
  (op) => `Dir("${paginateText(op.input.path, 100, -100)}")`,
  (op) => {
    if (op.output) {
      return `Created directory ${linkFile(op.output.fullPath)}`;
    }
    return null;
  }
);

export const dir_summary = renderer<'dir_summary'>(
  (op) => `DirSummary("${paginateText(op.input.path || '.', 100, -100)}")`,
  (op) => {
    if (op.output) {
      return `${linkFile(op.output.fullPath)}: ${pluralize(op.output.fileCount, 'file')}, ${pluralize(op.output.dirCount, 'dir')}, ${pluralize(op.output.extCount, 'extension')}`;
    }
    return null;
  }
);

export const file_attach = renderer<'file_attach'>(
  (op) => `FileAttach("${paginateText(op.input.path, 100, -100)}")`,
  (op) => {
    if (op.output?.attached) {
      return `Attached file: ${linkFile(op.output.fullPath)}`;
    }
    return null;
  }
);

const processShellOutput = (stdout: string, stderr: string) => {
  const allOutput = stdout + stderr;
  const lines = allOutput.split('\n').filter(l => l.length > 0);
  return { allOutput, lines, lineCount: lines.length };
};

export const shell = renderer<'shell'>(
  (op) => `Shell("${op.input.command}")`,
  (op) => {
    if (!op.output) {
      return 'Executing...';
    }

    const { lines, lineCount } = processShellOutput(op.output.stdout, op.output.stderr);
    const lastLines = lines.slice(-4);
    const exitCode = op.output.exitCode;
    const signal = op.output.signal;

    const statusText = exitCode !== null 
      ? `Exit code: ${exitCode}`
      : signal 
        ? `Terminated by signal: ${signal}`
        : 'Running...';

    return (
      <>
        {lastLines.length > 0 && (
          <div className="mt-1 p-2 bg-muted rounded font-mono text-sm">
            {lastLines.map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </div>
        )}
        {pluralize(lineCount, 'line')} - {statusText}
      </>
    );
  }
);