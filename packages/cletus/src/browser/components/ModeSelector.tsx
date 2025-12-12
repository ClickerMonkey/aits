import React from 'react';
import { Select, SelectOption } from './ui/select';

interface ModeSelectorProps {
  mode: string;
  onChange: (mode: string) => void;
  disabled?: boolean;
}

const MODE_OPTIONS: SelectOption[] = [
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
      <Select
        value={mode}
        options={MODE_OPTIONS}
        onChange={onChange}
        disabled={disabled}
        className="min-w-[140px]"
      />
    </div>
  );
};
