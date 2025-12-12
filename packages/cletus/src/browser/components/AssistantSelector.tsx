import React from 'react';
import { Bot } from 'lucide-react';
import { Select, SelectOption } from './ui/select';

interface AssistantSelectorProps {
  assistants: Array<{ name: string; prompt: string; created: number }>;
  currentAssistant?: string;
  onChange: (assistant: string) => void;
}

export const AssistantSelector: React.FC<AssistantSelectorProps> = ({
  assistants,
  currentAssistant,
  onChange,
}) => {
  const options: SelectOption[] = [
    { value: 'none', label: 'No assistant' },
    ...assistants.map((assistant) => ({
      value: assistant.name,
      label: assistant.name,
    })),
  ];

  return (
    <div className="flex items-center gap-2">
      <Bot className="w-4 h-4 text-muted-foreground" />
      <Select
        value={currentAssistant || 'none'}
        options={options}
        onChange={onChange}
        placeholder="No assistant"
        className="w-[180px]"
      />
    </div>
  );
};
