import React from 'react';
import { Select, SelectOption } from './ui/select';

interface AgentModeSelectorProps {
  agentMode: string;
  onChange: (agentMode: string) => void;
  disabled?: boolean;
}

const AGENT_MODE_OPTIONS: SelectOption[] = [
  {
    value: 'default',
    label: 'Run Mode',
    description: 'All toolsets available',
  },
  {
    value: 'plan',
    label: 'Plan Mode',
    description: 'Only planning related tools',
  },
];

export const AgentModeSelector: React.FC<AgentModeSelectorProps> = ({ agentMode, onChange, disabled }) => {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground">Agent:</label>
      <Select
        value={agentMode || 'default'}
        options={AGENT_MODE_OPTIONS}
        onChange={onChange}
        disabled={disabled}
        className="min-w-[140px]"
      />
    </div>
  );
};
