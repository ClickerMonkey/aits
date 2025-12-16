import React from 'react';
import { Select, SelectOption } from './ui/select';

interface ToolsetSelectorProps {
  toolset?: string | null;
  onChange: (toolset: string | null) => void;
  disabled?: boolean;
}

const TOOLSET_OPTIONS: SelectOption<string>[] = [
  {
    value: 'adaptive',
    label: 'Adaptive',
    description: 'AI selects tools based on context',
  },
  {
    value: 'planner',
    label: 'Planner',
    description: 'Todo and task management',
  },
  {
    value: 'librarian',
    label: 'Librarian',
    description: 'File and code operations',
  },
  {
    value: 'clerk',
    label: 'Clerk',
    description: 'Shell and system commands',
  },
  {
    value: 'secretary',
    label: 'Secretary',
    description: 'Chat and message operations',
  },
  {
    value: 'architect',
    label: 'Architect',
    description: 'Software design and planning',
  },
  {
    value: 'artist',
    label: 'Artist',
    description: 'Image generation and editing',
  },
  {
    value: 'internet',
    label: 'Internet',
    description: 'Web search and fetching',
  },
  {
    value: 'dba',
    label: 'DBA',
    description: 'Database operations',
  },
];

export const ToolsetSelector: React.FC<ToolsetSelectorProps> = ({ toolset, onChange, disabled }) => {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground">Toolset:</label>
      <Select
        value={toolset || 'adaptive'}
        options={TOOLSET_OPTIONS}
        onChange={value => onChange(value === 'adaptive' ? null : value)}
        disabled={disabled}
        className="min-w-[140px]"
      />
    </div>
  );
};
