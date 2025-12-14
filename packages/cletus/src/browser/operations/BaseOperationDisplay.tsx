import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Operation } from '../../schemas';
import { cn } from '../lib/utils';
import { getStatusInfo, getElapsedTime } from './render';

/**
 * Expandable details component with tabs
 */
const OperationDetails: React.FC<{ operation: Operation }> = ({ operation }) => {
  const [activeTab, setActiveTab] = useState<'input' | 'output' | 'analysis'>('input');
  const [isExpanded, setIsExpanded] = useState(false);

  const hasInput = operation.input !== undefined && operation.input !== null;
  const hasOutput = operation.output !== undefined && operation.output !== null;
  const hasAnalysis = operation.analysis !== undefined && operation.analysis !== null && operation.analysis.trim().length > 0;

  if (!hasInput && !hasOutput && !hasAnalysis) {
    return null;
  }

  // Default to first available tab
  const effectiveTab =
    (activeTab === 'input' && hasInput) ||
    (activeTab === 'output' && hasOutput) ||
    (activeTab === 'analysis' && hasAnalysis)
      ? activeTab
      : hasInput
      ? 'input'
      : hasOutput
      ? 'output'
      : 'analysis';

  return (
    <div className="ml-6 mt-2 border border-border rounded-lg overflow-hidden bg-muted/30">
      {/* Tabs */}
      <div className="flex border-b border-border">
        {hasInput && (
          <button
            onClick={() => setActiveTab('input')}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold transition-colors',
              effectiveTab === 'input'
                ? 'bg-muted text-foreground border-b-2 border-neon-cyan'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            Input
          </button>
        )}
        {hasOutput && (
          <button
            onClick={() => setActiveTab('output')}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold transition-colors',
              effectiveTab === 'output'
                ? 'bg-muted text-foreground border-b-2 border-neon-cyan'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            Output
          </button>
        )}
        {hasAnalysis && (
          <button
            onClick={() => setActiveTab('analysis')}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold transition-colors',
              effectiveTab === 'analysis'
                ? 'bg-muted text-foreground border-b-2 border-neon-cyan'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            Analysis
          </button>
        )}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="ml-auto px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {/* Content */}
      <textarea
        readOnly
        value={
          effectiveTab === 'input'
            ? JSON.stringify(operation.input, null, 2)
            : effectiveTab === 'output'
            ? JSON.stringify(operation.output, null, 2)
            : operation.analysis || ''
        }
        className={cn(
          'w-full p-3 text-xs font-mono bg-black text-white border-0 resize-y overflow-auto',
          'focus:outline-none focus:ring-2 focus:ring-neon-cyan/50',
          isExpanded ? 'h-auto' : 'max-h-[12rem]'
        )}
        style={isExpanded ? { height: 'auto', minHeight: '12rem' } : { height: '12rem' }}
      />
    </div>
  );
};

interface BaseOperationDisplayProps {
  operation: Operation;
  label: string;
  summary?: React.ReactNode | string | null;
  borderColor?: string;
  bgColor?: string;
  labelColor?: string;
  message?: { cost?: number; usage?: any };
}

/**
 * Base operation display component with consistent styling
 */
export const BaseOperationDisplay: React.FC<BaseOperationDisplayProps> = ({
  operation,
  label,
  summary,
  borderColor = 'border-border',
  bgColor = 'bg-card/50',
  labelColor = 'text-foreground',
  message,
}) => {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const { color: statusColor, label: statusLabel } = getStatusInfo(operation.status);
  const elapsed = getElapsedTime(operation);

  // Determine summary to display
  const displaySummary = operation.error ? operation.error : summary;

  return (
    <div className={cn('mb-3 rounded-lg p-3', bgColor)}>
      {/* Header - Clickable */}
      <div
        className="flex items-center gap-2 mb-2 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => setIsDetailsOpen(!isDetailsOpen)}
      >
        <span className={cn('text-lg', statusColor)}>●</span>
        <span className={cn('font-mono text-sm', labelColor)}>{label}</span>
        <span className="text-xs text-muted-foreground">[{statusLabel}]</span>
        {elapsed && <span className="text-xs text-muted-foreground">({elapsed})</span>}
      </div>

      {/* Summary */}
      {displaySummary && (
        <div className={cn('ml-6 text-sm mb-2 whitespace-pre-wrap', operation.error ? 'text-red-400' : 'text-muted-foreground')}>
          {typeof displaySummary === 'string' ? (
            <>
              <span className="text-foreground">→ </span>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <span>{children}</span>,
                }}
              >
                {displaySummary}
              </ReactMarkdown>
            </>
          ) : (
            displaySummary
          )}
        </div>
      )}

      {/* Details */}
      {isDetailsOpen && (
        <>
          <OperationDetails operation={operation} />

          {/* Cost and Usage Info */}
          {message && (message.cost !== undefined || message.usage) && (
            <div className="ml-6 mt-2 text-xs text-muted-foreground">
              {message.cost !== undefined && message.cost > 0 && (
                <span>cost: ${message.cost.toFixed(5)}</span>
              )}
              {message.usage?.text && (
                <span>
                  {message.cost !== undefined && message.cost > 0 ? ' │ ' : ''}
                  tokens: {(message.usage.text.input || 0) + (message.usage.text.output || 0)}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
