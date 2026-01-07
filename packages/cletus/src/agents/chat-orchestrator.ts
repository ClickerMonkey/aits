import { getInputTokens, getReasoningText, getTotalTokens, Usage } from '@aeye/core';
import type { ChatFile } from '../chat';
import { convertMessage, group } from '../common';
import type { ConfigFile } from '../config';
import { AUTONOMOUS } from '../constants';
import { logger } from '../logger';
import { OperationManager } from '../operations/manager';
import type { ChatMeta, Message, MessageContent, MessageContentType, Operation } from '../schemas';
import { CletusChatAgent } from './chat-agent';
import { CletusAIContext } from '../ai';

/**
 * Options for running the chat orchestrator
 */
export interface OrchestratorOptions {
  chatAgent: CletusChatAgent;
  messages: Message[];
  chatMeta: ChatMeta;
  config: ConfigFile;
  chatData: ChatFile;
  signal: AbortSignal;
  clearUsage: () => void;
  getUsage: () => { accumulated: Usage; accumulatedCost: number };
  events?: {
    onRefreshPending?: () => void;
    onRefreshChat?: () => void;
  };
}

/**
 * Events emitted by the chat orchestrator
 */
export type OrchestratorEvent =
  | { type: 'pendingUpdate'; pending: Message }
  | { type: 'update'; message: Message }
  | { type: 'usage'; accumulated: Usage; accumulatedCost: number; current: Usage }
  | { type: 'elapsed'; ms: number }
  | { type: 'operations'; operations: Operation[]; summary: string }
  | { type: 'status'; status: string }
  | { type: 'complete'; message: Message }
  | { type: 'error'; error: string };

// Silly verbs for status messages
const sillyVerbs = [
  'Conflabulating', 'Perambulating', 'Cogitating', 'Ruminating', 'Pontificating',
  'Extrapolating', 'Prognosticating', 'Theorizing', 'Speculating',
  'Deliberating', 'Contemplating', 'Meditating', 'Cerebrating', 'Lucubrating',
  'Ratiocinating', 'Excogitating', 'Noodling', 'Brainstorming', 'Puzzling',
  'Mulling', 'Ruminating', 'Brooding', 'Chewing', 'Digesting',
  'Processing', 'Computing', 'Calculating', 'Synthesizing',
  'Collating', 'Compiling', 'Assembling', 'Orchestrating',
  'Adjusting', 'Tuning',
  'Harmonizing', 'Balancing', 'Aligning', 'Synchronizing', 'Coordinating',
  'Triangulating', 'Interpolating', 'Extrapolating',
  'Quantifying', 'Tabulating', 'Enumerating', 'Tallying',
  'Cataloging', 'Classifying', 'Categorizing', 'Sorting',
  'Decoding', 'Deciphering', 'Translating', 'Interpreting',
  'Scrutinizing', 'Examining', 'Inspecting', 'Investigating', 'Probing',
  'Exploring', 'Surveying', 'Perusing',
  'Reviewing', 'Studying', 'Researching', 'Discovering', 'Uncovering',
  'Revealing', 'Exposing', 'Unveiling', 'Disclosing', 'Divulging',
  'Manifesting', 'Materializing', 'Actualizing', 'Realizing',
  'Accomplishing', 'Achieving', 'Fulfilling',
  'Cletusing', 'Cletusifying', 'Cletusating', 'Cletusizing', 'Cleting',
  'Cletering', 'Cletusting', 'Cletcletcleting', 'Cletarating', 'Cletabeating',
  'Cleticulating', 'Cletulating', 
];

/**
 * Run the chat orchestrator
 */
export async function runChatOrchestrator(
  options: OrchestratorOptions,
  onEvent: (event: OrchestratorEvent) => void,
): Promise<void> {
  const { chatAgent, messages, chatMeta, config, chatData, signal, clearUsage, getUsage, events } = options;

  const startTime = Date.now();
  const loopTimeout = config.getData().user.autonomous?.timeout ?? AUTONOMOUS.DEFAULT_TIMEOUT_MS;
  const loopMax = config.getData().user.autonomous?.maxIterations ?? AUTONOMOUS.DEFAULT_MAX_ITERATIONS;

  logger.log('orchestrator: starting');
  
  // Clear accumulated usage at the start of chat operations
  clearUsage();
  logger.log('orchestrator: cleared usage');

  // Start elapsed time updates
  const elapsedInterval = setInterval(() => {
    if (!signal.aborted) {
      onEvent({ type: 'elapsed', ms: Date.now() - startTime });
    }
  }, 100);

  let currentUsage: Usage = {};
  let messageUsage: Usage = {};
  let messageCost = 0;
  let toolTokens = 0;
  let lastTextIndex = -1; // Track wich content entry has the accumulated text

  const updateUsageEvent = () => {
    const accumulated = getUsage();
    onEvent({ 
      type: 'usage', 
      accumulated: accumulated.accumulated, 
      accumulatedCost: accumulated.accumulatedCost,
      current: currentUsage 
    });
  };

  try {
    // Convert messages to AI format
    const currentMessages = (await Promise.all(messages
      .filter((msg) => msg.role !== 'system')
      .map(convertMessage))).flat();

    let loopIteration = 0;
    let chatInterrupted = false;

    // Orchestration loop
    while (loopIteration < loopMax) {
      if (signal.aborted) {
        break;
      }

      // Check timeout
      if (Date.now() - startTime > loopTimeout) {
        const timeoutMinutes = Math.round(loopTimeout / AUTONOMOUS.MS_PER_MINUTE);
        onEvent({ type: 'error', error: `Operation timeout: exceeded ${timeoutMinutes} minute limit` });
        break;
      }

      loopIteration++;

      logger.log(`orchestrator: loop iteration ${loopIteration}`);
      
      // Reset current usage and tool tokens for this iteration
      currentUsage = {};
      toolTokens = 0;

      // Create pending assistant message
      const pending: Message = {
        role: 'assistant',
        name: chatMeta.assistant,
        content: [],
        created: Date.now(),
        operations: [],
      };

      // Helper to get or create the last text content entry (not tied to an operation)
      const getLastContent = (type: MessageContentType, forceNew = false): MessageContent => {
        // If forceNew, create a new entry
        if (forceNew) {
          const newContent = { type, content: '', created: Date.now() };
          pending.content.push(newContent);
          lastTextIndex = pending.content.length - 1;
          return newContent;
        }

        // Get the last entry - if it's text and not an operation, return it
        const last = pending.content[pending.content.length - 1];
        if (last && last.type === type && last.operationIndex === undefined) {
          lastTextIndex = pending.content.length - 1;
          return last;
        }

        // Create a new text content entry if none exists
        const newContent = { type: type, content: '', created: Date.now() };
        pending.content.push(newContent);
        lastTextIndex = pending.content.length - 1;
        return newContent;
      };

      // Helper function to estimate text output tokens from pending content
      const updateEstimatedTextOutputTokens = () => {
        const totalTextLength = pending.content
          .filter(c => (c.type === 'text' || c.type === 'reasoning') && c.operationIndex === undefined)
          .reduce((sum, c) => sum + c.content.length, 0);
        const estimatedTokens = Math.ceil(totalTextLength / 4);
        
        if (!currentUsage.text) {
          currentUsage.text = {};
        }
        // Add both text tokens and accumulated tool tokens
        currentUsage.text.output = estimatedTokens + toolTokens;
      };

      // Emit initial pending message
      onEvent({ type: 'pendingUpdate', pending });

      // Create operation manager
      const ops = new OperationManager(
        chatMeta.mode,
        pending.operations!,
        (op, operationIndex) => {
          // Update pending message operation
          pending.content.push({ type: 'text', content: op.message || '', operationIndex, created: Date.now() });
          onEvent({ type: 'pendingUpdate', pending });
        },
        (op, operationIndex) => {
          // Update pending message operation
          pending.operations![operationIndex] = op;
          const content = pending.content.find((c) => c.operationIndex === operationIndex);
          if (content) {
            content.content = op.message || '';
          }
          onEvent({ type: 'pendingUpdate', pending });
        },
      );

      logger.log('orchestrator: running chat agent');

      // Capture starting usage and cost for this message
      const startUsage = getUsage();
      const startingUsage: Usage = JSON.parse(JSON.stringify(startUsage.accumulated));
      const startingCost = startUsage.accumulatedCost;
      messageUsage = {};
      messageCost = 0;

      // Select random silly verb and emit status
      const randomVerb = sillyVerbs[Math.floor(Math.random() * sillyVerbs.length)];
      onEvent({ type: 'status', status: `${randomVerb}...` });

      let stackTrace: any;

      // Run chat agent
      const chatContext: Partial<CletusAIContext> = {
        ops,
        chat: chatMeta,
        chatData,
        chatMessage: pending,
        config,
        signal,
        persistentTools: new Set<string>(),
        messages: currentMessages,
        chatStatus: (status: string) => onEvent({ type: 'status', status }),
        chatInterrupt: () => {
          chatInterrupted = true;
        },
        events,
        /*
        // @ts-ignore
        runner: withEvents<typeof chatAgent>({
          onStatus: (node) => {
            const { id, status, error, input, output, component: { name, kind }, parent } = node;
            const parentId = parent ? `${parent.component.name} (${parent.component.kind})` : '';
            logger.log(`orchestrator! ${name} (${kind}) [${id}]: ${status} ${parentId ? `parent:{${parentId}}` : ``} ${error ? ` - ${error}` : ''}${status === 'pending' ? ` - input: ${JSON.stringify(input)}` : ''}${status === 'completed' ? ` - output: ${JSON.stringify(output)}` : ''}`);

            if (node.status !== 'pending' && node.status !== 'running' && node.component.name === 'cletus_chat') {
              // @ts-ignore
              stackTrace = node;
            }
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
          */
      } as const;

      const chatResponse = chatAgent.run({}, chatContext);

      logger.log('orchestrator: processing response');

      // Process streaming response
      try {
        for await (const chunk of chatResponse) {
          if (signal.aborted) {
            break;
          }

          switch (chunk.type) {
            case 'textPartial':
              {
                const lastContent = getLastContent('text');
                lastContent.content += chunk.content;

                // Estimate text output tokens
                updateEstimatedTextOutputTokens();

                onEvent({ type: 'pendingUpdate', pending });
                onEvent({ type: 'status', status: '' });
                updateUsageEvent();
              }
              break;

            case 'text':
              {
                /*
                // text event contains complete content for this iteration
                // If we haven't accumulated via textPartial, use it directly
                // Otherwise, textPartial has already accumulated it, so skip
                const lastContent = getLastContent('text');
                if (lastContent.content === '') {
                  // No textPartial events (non-streaming mode), use text content
                  lastContent.content = chunk.content;
                } else {
                  // textPartial already accumulated, verify it matches
                  // In streaming mode, text is redundant with textPartial accumulation
                }

                // Estimate text output tokens
                updateEstimatedTextOutputTokens();

                onEvent({ type: 'pendingUpdate', pending });
                updateUsageEvent();
                */
              }
              break;

            case 'reasonPartial':
              {
                const reasoningText = getReasoningText(chunk.reasoning);
                if (!pending.content.some(c => c.type === 'reasoning' && getReasoningText(c.reasoning) === reasoningText)) {
                  const lastContent = getLastContent('reasoning');
                  lastContent.reasoning = chunk.reasoning;

                  const status = chunk.reasoning.details?.find(d => d.type === 'reasoning.summary')?.summary || 'Thinking...';
                  
                  onEvent({ type: 'pendingUpdate', pending });
                  onEvent({ type: 'status', status });
                }
              }
              break;

            case 'reason':
              {
                /*
                // Add reasoning token estimation to current usage
                const reasoningTokens = Math.ceil((
                   (chunk.reasoning.content?.length || 0) +
                   (chunk.reasoning.details?.reduce((sum, d) => sum + (d.summary?.length || 0) + (d.text?.length || 0), 0) || 0)
                ) / 4);
                if (!currentUsage.reasoning) {
                  currentUsage.reasoning = {};
                }
                currentUsage.reasoning.output = reasoningTokens;

                let updatedPending = false;
                const serializedContent = JSON.stringify(chunk.reasoning);
                if (!pending.content.some(c => c.type === 'reasoning' && JSON.stringify(c.reasoning) === serializedContent)) {
                  const lastContent = getLastContent('reasoning');
                  lastContent.reasoning = chunk.reasoning;
                  updatedPending = true;
                }
                
                if (updatedPending) {
                  updateEstimatedTextOutputTokens();
                  onEvent({ type: 'pendingUpdate', pending });
                }
                updateUsageEvent();
                */
              }
              break;

            case 'toolOutput':
              {
                /*
                // After a tool completes, the next text should go into a new content entry
                // This ensures content from different tool iterations doesn't get mixed
                // Force creation of new text entry on next text event
                getLastContent('text', true);
                onEvent({ type: 'pendingUpdate', pending }); 
                */
              }
              break;

            case 'toolParseName': 
              {
                // Track recent tool usage in context so tools don't leave view
                chatContext.persistentTools!.add(chunk.tool.name);
              }
              break;

            case 'requestUsage':
              const lastUserMessageIndex = messages.findLastIndex((msg) => msg.role === 'user');
              const lastUserMessage = messages[lastUserMessageIndex];
              if (lastUserMessage && !lastUserMessage?.usage) {
                // const previousTokens =  messages.slice(0, lastUserMessageIndex).reduce((sum, msg) => sum + (msg.tokens || 0), 0);
                lastUserMessage.usage = chunk.usage;
                lastUserMessage.tokens = getInputTokens(chunk.usage)/* - previousTokens*/;
                onEvent({ type: 'update', message: lastUserMessage });
              }
              break;

            case 'responseTokens':
              // Add as estimated text output tokens
              pending.tokens = chunk.tokens;
              if (!currentUsage.text) {
                currentUsage.text = {};
              }
              currentUsage.text.output = chunk.tokens;
              updateUsageEvent();
              break;

            case 'toolStart':
              // Increment tool tokens for tool calls
              toolTokens += Math.ceil((chunk.tool.name.length + JSON.stringify(chunk.args).length) / 4);
              // Update estimated text output to include tool tokens
              updateEstimatedTextOutputTokens();
              updateUsageEvent();
              break;

            case 'toolInterrupt':
              chatInterrupted = true;
              onEvent({ type: 'pendingUpdate', pending });
              onEvent({ type: 'status', status: '' });
              updateUsageEvent();
              break;

            case 'usage':
              // Update current usage for this message
              currentUsage = chunk.usage;
              const previousTokens = messages.reduce((sum, msg) => sum + (msg.tokens || 0), 0);
              pending.tokens = getTotalTokens(chunk.usage) - previousTokens;
              updateUsageEvent();
              break;
          }
        }
      } finally {
        await chatResponse.return?.(undefined);

        if (stackTrace) {
          logger.log(`Cletus trace: ${JSON.stringify(stackTrace, (k, v) => {
            if (k === 'context' || k === 'parent') {
              return undefined
            }
            if (k === 'component') {
              return v.name;
            }
            if ((k === 'started' || k === 'completed') && typeof v === 'number') {
              return new Date(v).toISOString();
            }
            return v;
          }, 2)}`);
        }
        

        // Calculate message-specific usage and cost
        const endUsage = getUsage();
        messageUsage = {};
        
        // Calculate the difference in usage for this message
        const endAccumulated = endUsage.accumulated;
        
        // Text usage
        if (endAccumulated.text || startingUsage.text) {
          messageUsage.text = {
            input: (endAccumulated.text?.input || 0) - (startingUsage.text?.input || 0),
            output: (endAccumulated.text?.output || 0) - (startingUsage.text?.output || 0),
            cached: (endAccumulated.text?.cached || 0) - (startingUsage.text?.cached || 0),
          };
        }
        
        // Reasoning usage
        if (endAccumulated.reasoning || startingUsage.reasoning) {
          messageUsage.reasoning = {
            input: (endAccumulated.reasoning?.input || 0) - (startingUsage.reasoning?.input || 0),
            output: (endAccumulated.reasoning?.output || 0) - (startingUsage.reasoning?.output || 0),
            cached: (endAccumulated.reasoning?.cached || 0) - (startingUsage.reasoning?.cached || 0),
          };
        }
        
        messageCost = endUsage.accumulatedCost - startingCost;
        
        // Add usage and cost to the pending message
        pending.usage = messageUsage;
        pending.cost = messageCost;

        // Emit completion event
        onEvent({ type: 'complete', message: pending });
        
        // Emit final accumulated usage and cost
        onEvent({ type: 'usage', accumulated: endUsage.accumulated, accumulatedCost: endUsage.accumulatedCost, current: messageUsage });
      }      

      // Check for abort
      if (signal.aborted) {
        break;
      }

      // Log operation summary
      const operationSummary = group(
        ops.operations,
        (op) => op.status,
        (op) => op,
        (ops) => ops.length
      );

      logger.log(`orchestrator: operations summary: ${JSON.stringify(operationSummary)}`);

      // If the user needs to approve any OR there are no operations, exit loop
      const needsApproval = ops.operations.some((op) => op.status === 'analyzed');
      const noOperations = ops.operations.length === 0;
      const noTodos = chatMeta.todos.length === 0;
      if (needsApproval || noOperations || noTodos || chatInterrupted) {
        break;
      }

      // Push pending to current messages for context, continue loop
      currentMessages.push(...await convertMessage(pending));
      loopIteration++;
      currentUsage = {};
    }

    logger.log('orchestrator: completing');

    if (chatInterrupted) {
      options?.events?.onRefreshChat?.();
    }

  } catch (error: any) {
    if (error.message !== 'Aborted') {
      logger.log(`orchestrator: error - ${JSON.stringify(error)}`);

      onEvent({ type: 'error', error: error.error?.message || error.message || String(error) });
    }
  } finally {
    logger.log('orchestrator: finished');
    
    clearInterval(elapsedInterval);
  }
}
