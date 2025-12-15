import React from 'react';
import { Operation } from '../../schemas';
import { BaseOperationDisplay } from './BaseOperationDisplay';
import { OperationRendererProps } from './types';
import { cn } from '../lib/utils';

export const file_search: React.FC<OperationRendererProps> = (props) => {
  const { operation } = props;
  const summary = operation.output?.count !== undefined
    ? `Found ${operation.output.count} file${operation.output.count !== 1 ? 's' : ''}`
    : operation.analysis;
  return <BaseOperationDisplay {...props} label={`Files("${operation.input.glob}")`} summary={summary} />;
};

export const file_summary: React.FC<OperationRendererProps> = (props) => (
  <BaseOperationDisplay {...props} label={`Summary("${props.operation.input.path}")`} summary={props.operation.output?.summary || props.operation.analysis} />
);

export const file_index: React.FC<OperationRendererProps> = (props) => {
  const { operation } = props;
  const summary = operation.output?.indexed !== undefined
    ? `Indexed ${operation.output.indexed} file${operation.output.indexed !== 1 ? 's' : ''}`
    : operation.analysis;
  return <BaseOperationDisplay {...props} label={`Index("${operation.input.glob}")`} summary={summary} />;
};

export const file_create: React.FC<OperationRendererProps> = (props) => (
  <BaseOperationDisplay {...props} label={`Create("${props.operation.input.path}")`} summary={props.operation.output?.fullPath ? `Created ${props.operation.output.fullPath}` : props.operation.analysis} />
);

export const file_copy: React.FC<OperationRendererProps> = (props) => (
  <BaseOperationDisplay {...props} label={`Copy("${props.operation.input.from}" → "${props.operation.input.to}")`} summary={props.operation.output?.fullPath ? `Copied to ${props.operation.output.fullPath}` : props.operation.analysis} />
);

export const file_move: React.FC<OperationRendererProps> = (props) => (
  <BaseOperationDisplay {...props} label={`Move("${props.operation.input.from}" → "${props.operation.input.to}")`} summary={props.operation.output?.fullPath ? `Moved to ${props.operation.output.fullPath}` : props.operation.analysis} />
);

export const file_stats: React.FC<OperationRendererProps> = ({ operation }) => {
  let summary = operation.analysis;
  if (operation.output) {
    const size = operation.output.size;
    const sizeStr = size < 1024 ? `${size}B` :
                    size < 1024 * 1024 ? `${(size / 1024).toFixed(1)}KB` :
                    `${(size / (1024 * 1024)).toFixed(1)}MB`;
    summary = `${sizeStr} - ${operation.output.type}`;
  }
  return <BaseOperationDisplay operation={operation} label={`Stats("${operation.input.path}")`} summary={summary} />;
};

export const file_delete: React.FC<OperationRendererProps> = ({ operation }) => (
  <BaseOperationDisplay operation={operation} label={`Delete("${operation.input.path}")`} summary={operation.output ? 'Deleted' : operation.analysis} />
);

export const file_read: React.FC<OperationRendererProps> = ({ operation }) => {
  let summary = operation.analysis;
  if (operation.output) {
    const lines = (operation.output.content || '').split('\n').length;
    summary = `${lines} line${lines !== 1 ? 's' : ''}`;
  }
  return <BaseOperationDisplay operation={operation} label={`Read("${operation.input.path}")`} summary={summary} />;
};

export const file_edit: React.FC<OperationRendererProps> = ({ operation }) => {
  // Check if there are no changes to apply
  if (operation.cache?.changed === false) {
    return (
      <BaseOperationDisplay
        operation={operation}
        label={`Edit("${operation.input.path}")`}
        summary="No changes"
      />
    );
  }

  // Parse the diff to count additions and removals
  const diff = operation.cache?.diff || operation.output || operation.analysis || '';
  const diffLines = diff.split('\n');
  let additions = 0;
  let subtractions = 0;

  diffLines.forEach(line => {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      subtractions++;
    }
  });

  // Build summary with diff visualization
  const summaryContent = (
    <div>
      <span className="text-foreground">→ </span>
      <span>
        {operation.output ? 'Updated ' : operation.analysis ? 'Edit ' : 'Analyzing '}
        <span className="text-neon-cyan">{operation.input.path}</span>
        {diff && additions + subtractions > 0 && (
          <span>
            {' '}with {additions} addition{additions !== 1 ? 's' : ''} and {subtractions} removal{subtractions !== 1 ? 's' : ''}
          </span>
        )}
      </span>

      {/* Render diff */}
      {diff && (
        <div className="mt-2 text-xs font-mono">
          {diffLines
            .slice(4) // Skip header lines
            .filter(line => !line.startsWith('\\'))
            .map((line, index) => {
              const isAddition = line.startsWith('+') && !line.startsWith('+++');
              const isRemoval = line.startsWith('-') && !line.startsWith('---');
              const isContext = line.startsWith(' ');
              const isChunkHeader = line.startsWith('@@');

              if (isChunkHeader) {
                return (
                  <div key={index} className="text-muted-foreground my-1">
                    {index > 0 && <div className="my-1">...</div>}
                  </div>
                );
              }

              return (
                <div
                  key={index}
                  className={cn(
                    'whitespace-pre',
                    isAddition && 'bg-green-900/30 text-green-300',
                    isRemoval && 'bg-red-900/30 text-red-300',
                    isContext && 'text-muted-foreground'
                  )}
                >
                  {line}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );

  return (
    <BaseOperationDisplay
      operation={operation}
      label={`Edit("${operation.input.path}")`}
      summary={summaryContent}
      borderColor={operation.output ? 'border-border' : operation.status === 'rejected' ? 'border-muted' : 'border-green-500/30'}
      bgColor={operation.output ? 'bg-card/50' : operation.status === 'rejected' ? 'bg-muted/20' : 'bg-green-500/5'}
    />
  );
};

export const text_search: React.FC<OperationRendererProps> = ({ operation }) => {
  const summary = operation.output?.matches !== undefined
    ? `Found ${operation.output.matches} match${operation.output.matches !== 1 ? 'es' : ''}`
    : operation.analysis;
  return <BaseOperationDisplay operation={operation} label={`Search("${operation.input.pattern}")`} summary={summary} />;
};

export const dir_create: React.FC<OperationRendererProps> = ({ operation }) => (
  <BaseOperationDisplay operation={operation} label={`MkDir("${operation.input.path}")`} summary={operation.output?.fullPath ? `Created ${operation.output.fullPath}` : operation.analysis} />
);

export const dir_summary: React.FC<OperationRendererProps> = ({ operation }) => (
  <BaseOperationDisplay operation={operation} label={`DirSummary("${operation.input.path}")`} summary={operation.output?.summary || operation.analysis} />
);

export const file_attach: React.FC<OperationRendererProps> = ({ operation }) => (
  <BaseOperationDisplay operation={operation} label={`Attach("${operation.input.path}")`} summary={operation.output ? 'Attached to context' : operation.analysis} />
);

export const shell: React.FC<OperationRendererProps> = ({ operation }) => {
  const summary = operation.output
    ? `Exit code: ${operation.output.exitCode || 0}`
    : operation.analysis;
  return <BaseOperationDisplay operation={operation} label={`Shell("${operation.input.command}")`} summary={summary} />;
};
