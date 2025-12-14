import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const Select: React.FC<SelectProps> = ({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  className,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'flex items-center justify-between w-full rounded-md border border-border',
          'bg-card px-3 py-2 text-sm text-foreground',
          'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/50',
          'transition-colors',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <span className={cn(!selectedOption && 'text-muted-foreground')}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform',
            isOpen && 'transform rotate-180',
          )}
        />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute z-50 w-full mt-1 rounded-md border border-border',
            'bg-card shadow-lg max-h-60 overflow-auto',
          )}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => !option.disabled && handleSelect(option.value)}
              disabled={option.disabled}
              className={cn(
                'flex items-start gap-2 w-full px-3 py-2 text-sm text-left',
                'hover:bg-muted/50 focus:bg-muted/50 focus:outline-none',
                'transition-colors',
                option.disabled && 'opacity-50 cursor-not-allowed',
                value === option.value && 'bg-muted/30',
              )}
            >
              <div className="flex-shrink-0 w-4 h-4 mt-0.5">
                {value === option.value && <Check className="w-4 h-4 text-neon-cyan" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground">{option.label}</div>
                {option.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">{option.description}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
