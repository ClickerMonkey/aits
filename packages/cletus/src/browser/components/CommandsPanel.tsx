import React, { useEffect } from 'react';
import { X, HelpCircle } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

interface Command {
  name: string;
  description: string;
  usage?: string;
}

interface CommandsPanelProps {
  onClose: () => void;
}

const COMMANDS: Command[] = [
  { name: '/help', description: 'Show help information', usage: '/help' },
  { name: '/quit', description: 'Exit chat', usage: '/quit' },
  { name: '/assistant', description: 'Change assistant', usage: '/assistant <name>' },
  { name: '/mode', description: 'Change mode', usage: '/mode <none|read|create|update|delete>' },
  { name: '/model', description: 'Select chat model', usage: '/model' },
  { name: '/prompt', description: 'Set custom prompt', usage: '/prompt <your prompt>' },
  { name: '/title', description: 'Change chat title', usage: '/title <new title>' },
  { name: '/todos', description: 'View todos', usage: '/todos' },
  { name: '/do', description: 'Add a todo', usage: '/do <todo description>' },
  { name: '/done', description: 'Mark a todo as done', usage: '/done <todo number>' },
  { name: '/reset', description: 'Clear all todos', usage: '/reset' },
  { name: '/clear', description: 'Clear all chat messages (requires confirmation)', usage: '/clear' },
  { name: '/cd', description: 'Change current working directory', usage: '/cd [directory path]' },
  { name: '/debug', description: 'Toggle debug logging', usage: '/debug' },
];

const COMMAND_CATEGORIES = {
  'Chat Management': ['/help', '/quit', '/clear'],
  'Configuration': ['/assistant', '/mode', '/model', '/prompt', '/title'],
  'Todos': ['/todos', '/do', '/done', '/reset'],
  'Advanced': ['/cd', '/debug'],
};

export const CommandsPanel: React.FC<CommandsPanelProps> = ({ onClose }) => {
  const getCommandsByCategory = (category: string) => {
    const commandNames = COMMAND_CATEGORIES[category as keyof typeof COMMAND_CATEGORIES] || [];
    return COMMANDS.filter((cmd) => commandNames.includes(cmd.name));
  };

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[80vh] bg-card rounded-lg border border-border shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <HelpCircle className="w-6 h-6 text-neon-cyan" />
            <div>
              <h2 className="text-2xl font-bold neon-text-cyan">Commands & Help</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Available commands for this chat
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            {Object.keys(COMMAND_CATEGORIES).map((category) => (
              <div key={category}>
                <h3 className="text-lg font-semibold text-neon-purple mb-3">{category}</h3>
                <div className="space-y-2">
                  {getCommandsByCategory(category).map((command) => (
                    <div
                      key={command.name}
                      className="p-3 rounded-lg bg-muted/30 border border-border"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <code className="text-sm font-mono text-neon-cyan">{command.name}</code>
                          <p className="text-sm text-muted-foreground mt-1">
                            {command.description}
                          </p>
                        </div>
                      </div>
                      {command.usage && (
                        <div className="mt-2 text-xs text-muted-foreground font-mono bg-black/30 px-2 py-1 rounded">
                          {command.usage}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 p-4 rounded-lg bg-muted/50 border border-border">
            <h4 className="text-sm font-semibold text-foreground mb-2">Tips</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Type "/" in the chat input to see command suggestions</li>
              <li>• Use mode selectors in the header for quick access</li>
              <li>• Press ESC to close this panel</li>
            </ul>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};
