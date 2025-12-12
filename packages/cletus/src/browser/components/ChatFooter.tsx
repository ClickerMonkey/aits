import React from 'react';
import type { Config, ChatMeta } from '../../schemas';

interface ChatFooterProps {
  config: Config;
  chatMeta: ChatMeta;
  messageCount: number;
  totalCost?: number;
}

const MODETEXT: Record<string, string> = {
  none: 'local allowed',
  read: 'read allowed',
  create: 'create allowed',
  update: 'update allowed',
  delete: 'delete allowed',
};

const AGENTMODETEXT: Record<string, string> = {
  default: 'run mode',
  plan: 'plan mode',
};

export const ChatFooter: React.FC<ChatFooterProps> = ({
  config,
  chatMeta,
  messageCount,
  totalCost = 0,
}) => {
  const model = chatMeta.model || config.user.models?.chat || 'no model';
  const assistant = chatMeta.assistant;
  const modeText = MODETEXT[chatMeta.mode] || chatMeta.mode;
  const agentModeText = AGENTMODETEXT[chatMeta.agentMode || 'default'];
  const toolsetText = chatMeta.toolset ? `${chatMeta.toolset} toolset` : 'adaptive tools';
  const messageText = `${messageCount} message${messageCount !== 1 ? 's' : ''}`;
  const todoText = chatMeta.todos.length
    ? `${chatMeta.todos.length} todo${chatMeta.todos.length !== 1 ? 's' : ''}`
    : 'no todos';

  return (
    <div className="border-t border-border bg-card/30 backdrop-blur-sm px-6 py-2">
      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
        <span className="text-foreground">{model}</span>
        <span className="text-border">│</span>
        {assistant && (
          <>
            <span>{assistant}</span>
            <span className="text-border">│</span>
          </>
        )}
        <span>{modeText}</span>
        <span className="text-border">│</span>
        <span>{agentModeText}</span>
        <span className="text-border">│</span>
        <span>{toolsetText}</span>
        <span className="text-border">│</span>
        <span>{messageText}</span>
        <span className="text-border">│</span>
        <span>{todoText}</span>
        {totalCost > 0 && (
          <>
            <span className="text-border">│</span>
            <span className="text-yellow-400">${totalCost.toFixed(4)}</span>
          </>
        )}
      </div>
    </div>
  );
};
