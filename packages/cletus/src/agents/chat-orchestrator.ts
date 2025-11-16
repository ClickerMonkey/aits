import { getInputTokens, getTotalTokens, Usage } from '@aits/core';
import type { ChatFile } from '../chat';
import { convertMessage, group } from '../common';
import type { ConfigFile } from '../config';
import { AUTONOMOUS } from '../constants';
import { logger } from '../logger';
import { OperationManager } from '../operations/manager';
import type { ChatMeta, Message, Operation } from '../schemas';
import { createChatAgent } from './chat-agent';

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
  clearUsage: () => void;
  getUsage: () => { accumulated: Usage; accumulatedCost: number };
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
  'Extrapolating', 'Prognosticating', 'Hypothesizing', 'Theorizing', 'Speculating',
  'Deliberating', 'Contemplating', 'Meditating', 'Cerebrating', 'Lucubrating',
  'Ratiocinating', 'Excogitating', 'Noodling', 'Brainstorming', 'Puzzling',
  'Mulling', 'Ruminating', 'Brooding', 'Chewing', 'Digesting',
  'Processing', 'Computing', 'Calculating', 'Analyzing', 'Synthesizing',
  'Aggregating', 'Collating', 'Compiling', 'Assembling', 'Orchestrating',
  'Configuring', 'Optimizing', 'Recalibrating', 'Adjusting', 'Tuning',
  'Harmonizing', 'Balancing', 'Aligning', 'Synchronizing', 'Coordinating',
  'Triangulating', 'Interpolating', 'Extrapolating', 'Approximating', 'Estimating',
  'Evaluating', 'Assessing', 'Appraising', 'Gauging', 'Measuring',
  'Quantifying', 'Tabulating', 'Enumerating', 'Counting', 'Tallying',
  'Indexing', 'Cataloging', 'Classifying', 'Categorizing', 'Sorting',
  'Parsing', 'Decoding', 'Deciphering', 'Translating', 'Interpreting',
  'Scrutinizing', 'Examining', 'Inspecting', 'Investigating', 'Probing',
  'Exploring', 'Surveying', 'Scanning', 'Scouring', 'Perusing',
  'Reviewing', 'Studying', 'Researching', 'Discovering', 'Uncovering',
  'Revealing', 'Exposing', 'Unveiling', 'Disclosing', 'Divulging',
  'Manifesting', 'Materializing', 'Actualizing', 'Realizing', 'Implementing',
  'Executing', 'Performing', 'Accomplishing', 'Achieving', 'Fulfilling',
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
  const { chatAgent, messages, chatMeta, config, chatData, signal, clearUsage, getUsage } = options;

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
    const currentMessages = await Promise.all(messages
      .filter((msg) => msg.role !== 'system')
      .map(convertMessage));

    let loopIteration = 0;

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
        created: performance.now(),
        operations: [],
      };

      // Helper to get or create the last text content entry (not tied to an operation)
      const getLastTextContent = () => {
        // Get the last entry - if it's text and not an operation, return it
        const last = pending.content[pending.content.length - 1];
        if (last && last.type === 'text' && last.operationIndex === undefined) {
          return last;
        }
        // Create a new text content entry if none exists
        const newContent = { type: 'text' as const, content: '' };
        pending.content.push(newContent);
        return newContent;
      };

      // Helper function to estimate text output tokens from pending content
      const updateEstimatedTextOutputTokens = () => {
        const totalTextLength = pending.content
          .filter(c => c.type === 'text' && c.operationIndex === undefined)
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
          pending.content.push({ type: 'text', content: op.message || '', operationIndex });
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
      const chatResponse = chatAgent.run({}, {
        ops,
        chat: chatMeta,
        chatData,
        chatMessage: pending,
        config,
        signal,
        messages: currentMessages,
        chatStatus: (status: string) => onEvent({ type: 'status', status }),
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
      });

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
                const lastContent = getLastTextContent();
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
                const lastContent = getLastTextContent();
                lastContent.content = chunk.content;
                
                // Estimate text output tokens
                updateEstimatedTextOutputTokens();
                
                onEvent({ type: 'pendingUpdate', pending });
                updateUsageEvent();
              }
              break;

            case 'textReset':
              {
                // Clear all non-operation text 
                const last = pending.content[pending.content.length - 1];
                if (last.operationIndex === undefined && last.type === 'text') {
                  last.content = '';
                }
                // Reset only text output tokens
                if (currentUsage.text) {
                  currentUsage.text.output = 0;
                }
                onEvent({ type: 'pendingUpdate', pending });
                updateUsageEvent();
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

            case 'reason':
              // Add reasoning token estimation to current usage
              const reasoningTokens = Math.ceil(chunk.content.length / 4);
              if (!currentUsage.reasoning) {
                currentUsage.reasoning = {};
              }
              currentUsage.reasoning.output = reasoningTokens;
              updateUsageEvent();
              break;

            case 'toolStart':
              // Increment tool tokens for tool calls
              toolTokens += Math.ceil((chunk.tool.name.length + JSON.stringify(chunk.args).length) / 4);
              // Update estimated text output to include tool tokens
              updateEstimatedTextOutputTokens();
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
      if (needsApproval || noOperations || noTodos) {
        break;
      }

      // Push pending to current messages for context, continue loop
      currentMessages.push(await convertMessage(pending));
      loopIteration++;
      currentUsage = {};
    }

    logger.log('orchestrator: completing');

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
