import { Message as AIMessage, MessageContent as AIMessageContent, withEvents } from '@aits/core';
import type { ChatFile } from '../chat.js';
import type { ConfigFile } from '../config.js';
import { OperationManager } from '../operations/manager.js';
import type { ChatMeta, Message, MessageContent, Operation } from '../schemas.js';
import { createChatAgent } from './chat-agent.js';
import { logger } from '../logger.js';

/**
 * Options for running the chat orchestrator
 */
export interface OrchestratorOptions {
  chatAgent: ReturnType<typeof createChatAgent>;
  messages: Message[];
  chatMeta: ChatMeta;
  config: ConfigFile;
  chatData: ChatFile;
  signal: AbortSignal;
}

/**
 * Events emitted by the chat orchestrator
 */
export type OrchestratorEvent =
  | { type: 'userMessage'; message: Message }
  | { type: 'pendingUpdate'; message: Message }
  | { type: 'tokens'; output: number; reasoning: number; discarded: number }
  | { type: 'elapsed'; ms: number }
  | { type: 'operations'; operations: Operation[]; summary: string }
  | { type: 'complete'; message: Message }
  | { type: 'error'; error: string };

/**
 * Convert MessageContent to AIMessageContent, transforming URLs
 */
function convertContent(content: MessageContent): AIMessageContent {
  return {
    type: content.type,
    content: typeof content.content === 'string' && /^(file|https?):\/\//.test(content.content)
      ? new URL(content.content)
      : content.content,
  } as AIMessageContent;
}

/**
 * Run the chat orchestrator
 */
export async function runChatOrchestrator(
  options: OrchestratorOptions,
  onEvent: (event: OrchestratorEvent) => void,
): Promise<void> {
  const { chatAgent, messages, chatMeta, config, chatData, signal } = options;

  const startTime = Date.now();
  const LOOP_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  logger.log('orchestrator: starting');

  // Start elapsed time updates
  const elapsedInterval = setInterval(() => {
    if (!signal.aborted) {
      onEvent({ type: 'elapsed', ms: Date.now() - startTime });
    }
  }, 100);

  let tokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let discardedTokens = 0;

  const setOutputTokens = (count: number) => {
    outputTokens = count;
    updateTokenCount();
  };

  const setReasoningTokens = (count: number) => {
    reasoningTokens = count;
    updateTokenCount();
  };

  const addDiscardedTokens = (count: number) => {
    discardedTokens += count;
    updateTokenCount();
  };

  const updateTokenCount = () => {
    tokens = outputTokens + reasoningTokens + discardedTokens;
    onEvent({ type: 'tokens', output: outputTokens, reasoning: reasoningTokens, discarded: discardedTokens });
  };

  try {
    // Convert messages to AI format
    const aiMessages: AIMessage[] = messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        ...msg,
        content: [
          ...(msg.operations 
            ? msg.operations.map((op): AIMessageContent => ({ type: 'text', content: op.message || op.analysis || 'pending...' })) 
            : []
          ),
          ...msg.content.map(convertContent)
        ],
      }));

    let currentMessages = aiMessages;
    let loopIteration = 0;

    // Orchestration loop
    while (loopIteration === 0) { // just do one for now
      if (signal.aborted) {
        break;
      }

      // Check timeout
      if (Date.now() - startTime > LOOP_TIMEOUT) {
        onEvent({ type: 'error', error: 'Operation timeout: exceeded 5 minute limit' });
        break;
      }

      loopIteration++;

      logger.log(`orchestrator: loop iteration ${loopIteration}`);

      // Create pending assistant message
      const pending: Message = {
        role: 'assistant',
        name: chatMeta.assistant,
        content: [{ type: 'text', content: '' }],
        created: Date.now(),
      };

      // Emit initial pending message
      onEvent({ type: 'pendingUpdate', message: { ...pending } });

      // Create operation manager
      const ops = new OperationManager(chatMeta.mode);

      logger.log('orchestrator: running chat agent');

      // Run chat agent
      const chatResponse = chatAgent.run({}, {
        ops,
        chat: chatMeta,
        chatData,
        config,
        signal,
        messages: currentMessages,
        metadata: {
          model: chatMeta.model ?? config.getData().user.models?.chat,
        },
        // @ts-ignore
        runner: withEvents<typeof chatAgent>({
          onStatus: (node) => {
            const { id, status, error, input, output, component: { name, kind }, parent } = node;
            const parentId = parent ? `${parent.component.name} (${parent.component.kind})` : '';
            logger.log(`orchestrator! ${name} (${kind}) [${id}]: ${status} ${parentId ? `parent:{${parentId}}` : ``} ${error ? ` - ${error}` : ''}${status === 'pending' ? ` - input: ${JSON.stringify(input)}` : ''}${status === 'completed' ? ` - output: ${JSON.stringify(output)}` : ''}`);
          },
          onPromptEvent: (instance, event) => {
            // @ts-ignore
            const { id, component: { name, kind } } = instance;
            const componentId = `${name} (${kind}) [${id}]`;
            if (event.type !== 'textPartial' && event.type !== 'complete') {
              const { request, type, ...rest } = event;
              if ('tool' in rest) {
                (rest as any).tool = { name: (rest.tool as any).name }; // TODO fix
              }
              logger.log(`orchestrator! prompt event from ${componentId} {${event.type}}: ${JSON.stringify(rest)}`);
            }
            if (event.type === 'complete') {
              logger.log(`orchestrator! prompt complete from ${componentId}: ${JSON.stringify(event.request)}`);
            }
          }
        })
      });

      logger.log('orchestrator: processing response');

      // Process streaming response
      for await (const chunk of chatResponse) {
        if (signal.aborted) {
          break;
        }

        switch (chunk.type) {
          case 'textPartial':
            pending.content[0].content += chunk.content;
            setOutputTokens(Math.ceil(pending.content[0].content.length / 4));
            onEvent({ type: 'pendingUpdate', message: { ...pending } });
            break;

          case 'textComplete':
            pending.content[0].content = chunk.content;
            onEvent({ type: 'pendingUpdate', message: { ...pending } });
            break;

          case 'textReset':
            pending.content[0].content = '';
            addDiscardedTokens(outputTokens);
            setOutputTokens(0);
            onEvent({ type: 'pendingUpdate', message: { ...pending } });
            break;

          case 'requestTokens':
            // Update user message tokens if this is first iteration
            if (loopIteration === 1 && messages.length > 0) {
              const lastUserMsg = messages[messages.length - 1];
              if (lastUserMsg.role === 'user') {
                lastUserMsg.tokens = chunk.tokens;
                await chatData.save((chat) => {
                  const msgIndex = chat.messages.findIndex((m) => m.created === lastUserMsg.created);
                  if (msgIndex >= 0) {
                    chat.messages[msgIndex].tokens = chunk.tokens;
                  }
                });
              }
            }
            break;

          case 'responseTokens':
            setOutputTokens(chunk.tokens);
            pending.tokens = chunk.tokens;
            break;

          case 'reason':
            setReasoningTokens(Math.ceil(chunk.content.length / 4));
            break;

          case 'toolStart':
            addDiscardedTokens(Math.ceil((chunk.tool.name.length + JSON.stringify(chunk.args).length) / 4));
            break;

          case 'usage':
            discardedTokens = 0;
            setReasoningTokens(chunk.usage.reasoningTokens || 0);
            setOutputTokens(chunk.usage.totalTokens || 0);
            break;
        }
      }

      // Save operations if any
      if (ops.operations.length > 0) {
        pending.operations = ops.operations;

        logger.log(`orchestrator: ${ops.operations.length} operations executed`);

        // Save to chat file
        await chatData.save((chat) => {
          // Find or add the pending message
          const existingIndex = chat.messages.findIndex((m) => m.created === pending.created);
          if (existingIndex >= 0) {
            chat.messages[existingIndex].operations = ops.operations;
          }
        });

        const done = ops.operations.filter((op) => op.status === 'done').length;
        const needApproval = ops.operations.filter((op) => op.status === 'analyzed').length;
        const undoable = ops.operations.filter((op) => op.status === 'analyzedBlocked').length;
        const errors = ops.operations.filter((op) => op.error).length;

        const summary = `⚙️ ${ops.operations.length} operations ${JSON.stringify({ done, needApproval, undoable, errors })}`;
        onEvent({ type: 'operations', operations: ops.operations, summary });

        // Check if we should loop
        const allExecuted = ops.operations.every((op) => op.output || op.error);
        if (allExecuted && ops.operations.length > 0) {
          logger.log('orchestrator: all operations executed, looping');

          // Add operation result messages to context
          const operationMessages: AIMessage[] = ops.operations.map((op) => ({
            role: 'assistant',
            name: chatMeta.assistant,
            content: [{ type: 'text' as const, content: op.message || '' }],
            created: Date.now(),
          }));

          currentMessages = [...currentMessages, ...operationMessages];

          // Reset token counters for next iteration
          outputTokens = 0;
          reasoningTokens = 0;
          discardedTokens = 0;

          // Continue loop
          continue;
        }
      }

      logger.log('orchestrator: completing');

      // Save final assistant message
      await chatData.save((chat) => {
        chat.messages.push(pending);
      });

      onEvent({ type: 'complete', message: pending });
      break;
    }
  } catch (error: any) {
    if (error.message !== 'Aborted') {
      logger.log(`orchestrator: error - ${error.message}: ${error.stack}`);
      onEvent({ type: 'error', error: error.message });
    }
  } finally {
    logger.log('orchestrator: finished');
    clearInterval(elapsedInterval);
  }
}
