import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Settings, FolderOpen } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';

interface ChatSettingsDialogProps {
  title: string;
  prompt?: string;
  cwd?: string;
  onSave: (updates: { title?: string; prompt?: string; cwd?: string }) => void;
  onClose: () => void;
}

export const ChatSettingsDialog: React.FC<ChatSettingsDialogProps> = ({
  title: initialTitle,
  prompt: initialPrompt,
  cwd: initialCwd,
  onSave,
  onClose,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [prompt, setPrompt] = useState(initialPrompt || '');
  const [cwd, setCwd] = useState(initialCwd || '');

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

  const handleSave = () => {
    const updates: { title?: string; prompt?: string; cwd?: string } = {};

    if (title !== initialTitle) {
      updates.title = title;
    }
    if (prompt !== initialPrompt) {
      updates.prompt = prompt || undefined;
    }
    if (cwd !== initialCwd) {
      updates.cwd = cwd || undefined;
    }

    if (Object.keys(updates).length > 0) {
      onSave(updates);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[80vh] bg-card rounded-lg border border-border shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6 text-neon-cyan" />
            <h2 className="text-2xl font-bold neon-text-cyan">Chat Settings</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Chat Title
              </label>
              <Input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter chat title"
                className="w-full"
              />
            </div>

            {/* Custom Prompt */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Custom Prompt
              </label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter custom prompt (optional)"
                className="min-h-[120px] resize-none"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Override the default system prompt for this chat
              </p>
            </div>

            {/* Working Directory */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Working Directory
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={cwd}
                  onChange={(e) => setCwd(e.target.value)}
                  placeholder="Enter working directory path (optional)"
                  className="flex-1 font-mono text-sm"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.webkitdirectory = true;
                    input.onchange = (e: any) => {
                      const files = e.target.files;
                      if (files && files.length > 0) {
                        const path = files[0].path || files[0].webkitRelativePath.split('/')[0];
                        setCwd(path);
                      }
                    };
                    input.click();
                  }}
                  title="Select folder"
                >
                  <FolderOpen className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Set the current working directory for file operations
              </p>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="neon" onClick={handleSave} className="gap-2">
            <Save className="w-4 h-4" />
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
};
