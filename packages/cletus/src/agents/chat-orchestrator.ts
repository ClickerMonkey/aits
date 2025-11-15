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
}

/**
 * Events emitted by the chat orchestrator
 */
export type OrchestratorEvent =
  | { type: 'pendingUpdate'; pending: Message }
  | { type: 'update'; message: Message }
  | { type: 'tokens'; output: number; reasoning: number; discarded: number }
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
  const { chatAgent, messages, chatMeta, config, chatData, signal } = options;

  const startTime = Date.now();
  const loopTimeout = config.getData().user.autonomous?.timeout ?? AUTONOMOUS.DEFAULT_TIMEOUT_MS;
  const loopMax = config.getData().user.autonomous?.maxIterations ?? AUTONOMOUS.DEFAULT_MAX_ITERATIONS;

  logger.log('orchestrator: starting');

  // Start elapsed time updates
  const elapsedInterval = setInterval(() => {
    if (!signal.aborted) {
      onEvent({ type: 'elapsed', ms: Date.now() - startTime });
    }
  }, 100);

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
    onEvent({ type: 'tokens', output: outputTokens, reasoning: reasoningTokens, discarded: discardedTokens });
  };

  try {
    // Convert messages to AI format
    const currentMessages = messages
      .filter((msg) => msg.role !== 'system')
      .map(convertMessage);

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

      // Create pending assistant message
      const pending: Message = {
        role: 'assistant',
        name: chatMeta.assistant,
        content: [{ type: 'text', content: '' }],
        created: Date.now(),
        operations: [],
      };

      // Helper to get or create the last text content entry (not tied to an operation)
      const getLastTextContent = () => {
        // Find the last content entry without an operationIndex
        for (let i = pending.content.length - 1; i >= 0; i--) {
          if (pending.content[i].type === 'text' && pending.content[i].operationIndex === undefined) {
            return pending.content[i];
          }
        }
        // Create a new text content entry if none exists
        const newContent = { type: 'text' as const, content: '' };
        pending.content.push(newContent);
        return newContent;
      };

      // Override push to emit updates and add new content entry for next text
      pending.operations!.push = function (...items: Operation[]) {
        const result = Array.prototype.push.apply(this, items);
        
        // For each new operation, create a new content entry tied to it
        for (let i = 0; i < items.length; i++) {
          const op = items[i];
          const operationIndex = pending.operations!.length - items.length + i;
          // Add a new text content entry for text that comes after this operation
          pending.content.push({ type: 'text', content: op.message || '', operationIndex });
        }
        
        onEvent({ type: 'pendingUpdate', pending });
        return result;
      };

      // Emit initial pending message
      onEvent({ type: 'pendingUpdate', pending });

      // Create operation manager
      const ops = new OperationManager(chatMeta.mode);

      logger.log('orchestrator: running chat agent');

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
                const totalTextLength = pending.content
                  .filter(c => c.type === 'text' && c.operationIndex === undefined)
                  .reduce((sum, c) => sum + c.content.length, 0);
                setOutputTokens(Math.ceil(totalTextLength / 4));
                onEvent({ type: 'pendingUpdate', pending });
                onEvent({ type: 'status', status: '' });
              }
              break;

            case 'text':
              {
                const lastContent = getLastTextContent();
                lastContent.content += chunk.content;
                const totalTextLength = pending.content
                  .filter(c => c.type === 'text' && c.operationIndex === undefined)
                  .reduce((sum, c) => sum + c.content.length, 0);
                setOutputTokens(Math.ceil(totalTextLength / 4));
                onEvent({ type: 'pendingUpdate', pending });
              }
              break;

            case 'textComplete':
              {
                // Set all text content (concatenated)
                const allText = pending.content
                  .filter(c => c.type === 'text' && c.operationIndex === undefined)
                  .map(c => c.content)
                  .join('');
                // Only update if different from what we expect
                if (allText !== chunk.content) {
                  // Reset all text content and set to the complete text
                  pending.content = pending.content.filter(c => c.operationIndex !== undefined);
                  pending.content.unshift({ type: 'text', content: chunk.content });
                }
                onEvent({ type: 'pendingUpdate', pending });
              }
              break;

            case 'complete':
              {
                // Set all text content to the output
                pending.content = pending.content.filter(c => c.operationIndex !== undefined);
                pending.content.unshift({ type: 'text', content: chunk.output });
                onEvent({ type: 'pendingUpdate', pending });
              }
              break;

            case 'textReset':
              {
                // Clear all non-operation text content
                pending.content = pending.content.filter(c => c.operationIndex !== undefined);
                pending.content.unshift({ type: 'text', content: '' });
                addDiscardedTokens(outputTokens);
                setOutputTokens(0);
                onEvent({ type: 'pendingUpdate', pending });
              }
              break;

            case 'requestTokens':
              const lastUserMessage = messages.findLast((msg) => msg.role === 'user');
              if (lastUserMessage && !lastUserMessage?.tokens) {
                lastUserMessage.tokens = chunk.tokens;
                onEvent({ type: 'update', message: lastUserMessage });
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

        // Emit completion event
        onEvent({ type: 'complete', message: pending });
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
      currentMessages.push(convertMessage(pending));
      loopIteration++;
      outputTokens = 0;
      reasoningTokens = 0;
      discardedTokens = 0;
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
