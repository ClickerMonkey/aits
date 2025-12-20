import React from 'react';
import { AgentMode } from '../../schemas';
import { cn } from '../lib/utils';

interface AgentModeSelectorProps {
  agentMode: AgentMode;
  onChange: (agentMode: AgentMode) => void;
  disabled?: boolean;
}

export const AgentModeSelector: React.FC<AgentModeSelectorProps> = ({ agentMode, onChange, disabled }) => {
  const currentMode = agentMode || 'default';

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-1">
      <button
        onClick={() => onChange('default')}
        disabled={disabled}
        className={cn(
          'px-3 py-1 text-sm rounded transition-colors',
          currentMode === 'default'
            ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        title="Run Mode - All toolsets available"
      >
        Run
      </button>
      <button
        onClick={() => onChange('plan')}
        disabled={disabled}
        className={cn(
          'px-3 py-1 text-sm rounded transition-colors',
          currentMode === 'plan'
            ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        title="Plan Mode - Only planning related tools"
      >
        Plan
      </button>
    </div>
  );
};
