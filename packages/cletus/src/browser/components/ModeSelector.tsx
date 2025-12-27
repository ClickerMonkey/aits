import React from 'react';
import { Select, SelectOption } from './ui/select';
import { ChatMode } from '../../schemas';

interface ModeSelectorProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
}

const MODE_OPTIONS: SelectOption<ChatMode>[] = [
  {
    value: 'none',
    label: 'None',
    description: 'All AI operations require approval (safest)',
  },
  {
    value: 'read',
    label: 'Read',
    description: 'Auto-approve read operations',
  },
  {
    value: 'create',
    label: 'Create',
    description: 'Auto-approve read & create operations',
  },
  {
    value: 'update',
    label: 'Update',
    description: 'Auto-approve read, create & update operations',
  },
  {
    value: 'delete',
    label: 'Delete',
    description: 'Auto-approve all operations (least safe)',
  },
];

export const ModeSelector: React.FC<ModeSelectorProps> = ({ mode, onChange, disabled }) => {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground">Mode:</label>
      <Select<ChatMode>
        value={mode}
        options={MODE_OPTIONS}
        onChange={value => onChange(value)}
        disabled={disabled}
        className="min-w-[140px]"
      />
    </div>
  );
};
