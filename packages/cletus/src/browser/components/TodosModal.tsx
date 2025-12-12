import React, { useState, useEffect } from 'react';
import { X, CheckSquare, Square, Plus, Trash2, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import type { ChatMeta } from '../../schemas';

interface TodosModalProps {
  todos: ChatMeta['todos'];
  onAddTodo: (todo: string) => void;
  onToggleTodo: (index: number) => void;
  onRemoveTodo: (index: number) => void;
  onClearTodos: () => void;
  onClose: () => void;
}

export const TodosModal: React.FC<TodosModalProps> = ({
  todos,
  onAddTodo,
  onToggleTodo,
  onRemoveTodo,
  onClearTodos,
  onClose,
}) => {
  const [newTodo, setNewTodo] = useState('');

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

  const handleAdd = () => {
    if (newTodo.trim()) {
      onAddTodo(newTodo.trim());
      setNewTodo('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  const completedCount = todos.filter((t) => t.done).length;
  const totalCount = todos.length;

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
          <div>
            <h2 className="text-2xl font-bold neon-text-cyan flex items-center gap-2">
              <CheckSquare className="w-6 h-6" />
              Todos
            </h2>
            {totalCount > 0 && (
              <p className="text-sm text-muted-foreground mt-1">
                {completedCount} of {totalCount} completed
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {totalCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearTodos}
                className="gap-2 text-destructive hover:text-destructive"
              >
                <RotateCcw className="w-4 h-4" />
                Clear All
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Add Todo */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a new todo..."
              className="flex-1"
              autoFocus
            />
            <Button
              variant="neon"
              onClick={handleAdd}
              disabled={!newTodo.trim()}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Add
            </Button>
          </div>
        </div>

        {/* Todos List */}
        <ScrollArea className="flex-1 p-6">
          {todos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No todos yet</p>
              <p className="text-sm mt-1">Add one above to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {todos.map((todo, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-3 p-3 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors ${
                    todo.done ? 'opacity-60' : ''
                  }`}
                >
                  <button
                    onClick={() => onToggleTodo(index)}
                    className="flex-shrink-0 mt-0.5 text-muted-foreground hover:text-neon-cyan transition-colors"
                  >
                    {todo.done ? (
                      <CheckSquare className="w-5 h-5 text-neon-cyan" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm ${
                        todo.done
                          ? 'line-through text-muted-foreground'
                          : 'text-foreground'
                      }`}
                    >
                      {todo.name}
                    </p>
                  </div>
                  <button
                    onClick={() => onRemoveTodo(index)}
                    className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t border-border text-xs text-muted-foreground">
          Press ESC to close | Click outside to close
        </div>
      </div>
    </div>
  );
};
