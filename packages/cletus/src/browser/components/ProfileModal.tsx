import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { ReasoningLevel, User, type Config } from '../../schemas';
import { Select, SelectOption } from './ui/select';

interface ProfileModalProps {
  user: Config['user'];
  onSave: (updates: Partial<Config['user']>) => void;
  onClose: () => void;
}

const reasoningOptions: SelectOption<ReasoningLevel>[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const ProfileModal: React.FC<ProfileModalProps> = ({ user, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    name: user.name || '',
    pronouns: user.pronouns || '',
    globalPrompt: user.globalPrompt || '',
    adaptiveTools: user.adaptiveTools ?? 14,
    maxQuerySchemaTypes: user.maxQuerySchemaTypes ?? 5,
    maxIterations: user.autonomous?.maxIterations ?? 10,
    timeout: user.autonomous?.timeout ?? 600000,
    reasoning: user.reasoning || 'none',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const updates: Partial<Config['user']> = {
      name: formData.name.trim() || user.name,
      pronouns: formData.pronouns.trim() || undefined,
      globalPrompt: formData.globalPrompt.trim() || undefined,
      adaptiveTools: formData.adaptiveTools,
      maxQuerySchemaTypes: formData.maxQuerySchemaTypes,
      reasoning: formData.reasoning,
      autonomous: {
        maxIterations: formData.maxIterations,
        timeout: formData.timeout,
      },
    };

    onSave(updates);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-card rounded-lg border border-border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-card/50">
          <h2 className="text-2xl font-bold neon-text-purple">Profile Settings</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-160px)]">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold neon-text-cyan">Basic Information</h3>

              <div className="space-y-2">
                <Label htmlFor="name" className="text-white">Name *</Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pronouns" className="text-white">Pronouns</Label>
                <Input
                  id="pronouns"
                  type="text"
                  value={formData.pronouns}
                  onChange={(e) => setFormData({ ...formData, pronouns: e.target.value })}
                  placeholder="e.g., they/them, she/her, he/him"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="globalPrompt" className="text-white">Global Prompt</Label>
                <textarea
                  id="globalPrompt"
                  value={formData.globalPrompt}
                  onChange={(e) => setFormData({ ...formData, globalPrompt: e.target.value })}
                  className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground resize-y"
                  placeholder="Add a global prompt that will be included in all chats..."
                />
              </div>
            </div>

            {/* Advanced Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold neon-text-cyan">Advanced Settings</h3>

              <div className="space-y-2">
                <Label htmlFor="reasoning" className="text-white">Reasoning Level</Label>
                <Select<ReasoningLevel>
                  value={formData.reasoning}
                  options={reasoningOptions}
                  onChange={(value) => setFormData({ ...formData, reasoning: value })}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Set your preferred reasoning level for chat
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adaptiveTools" className="text-white">Adaptive Tools Limit</Label>
                <Input
                  id="adaptiveTools"
                  type="number"
                  min="1"
                  value={formData.adaptiveTools}
                  onChange={(e) => setFormData({ ...formData, adaptiveTools: parseInt(e.target.value, 10) || 14 })}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum number of adaptive tools to use
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxQuerySchemaTypes" className="text-white">Max Query Schema Types</Label>
                <Input
                  id="maxQuerySchemaTypes"
                  type="number"
                  min="0"
                  value={formData.maxQuerySchemaTypes}
                  onChange={(e) => setFormData({ ...formData, maxQuerySchemaTypes: parseInt(e.target.value, 10) || 5 })}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum number of schema types for queries
                </p>
              </div>
            </div>

            {/* Autonomous Mode Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold neon-text-cyan">Autonomous Mode</h3>

              <div className="space-y-2">
                <Label htmlFor="maxIterations" className="text-white">Max Iterations</Label>
                <Input
                  id="maxIterations"
                  type="number"
                  min="1"
                  value={formData.maxIterations}
                  onChange={(e) => setFormData({ ...formData, maxIterations: parseInt(e.target.value, 10) || 10 })}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum number of autonomous iterations
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeout" className="text-white">Timeout (ms)</Label>
                <Input
                  id="timeout"
                  type="number"
                  min="1000"
                  step="1000"
                  value={formData.timeout}
                  onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value, 10) || 600000 })}
                />
                <p className="text-xs text-muted-foreground">
                  Timeout for autonomous operations in milliseconds
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-6 border-t border-border bg-card/50">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="neon">
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
