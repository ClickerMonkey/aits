import { Message as AIMessage, MessageContent as AIMessageContent, withEvents } from '@aits/core';
import type { ChatFile } from '../chat';
import type { ConfigFile } from '../config';
import { OperationManager } from '../operations/manager';
import type { ChatMeta, Message, MessageContent, Operation } from '../schemas';
import { createChatAgent } from './chat-agent';
import { logger } from '../logger';
import { group } from '../common';

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
  | { type: 'status'; status: string }
  | { type: 'complete'; message: Message }
  | { type: 'error'; error: string };

/**
 * Convert MessageContent to AIMessageContent, transforming URLs
 */
function convertContent(content: MessageContent): AIMessageContent {
  return {
    type: content.type || 'text',
    content: typeof content.content === 'string' && /^(file|https?):\/\//.test(content.content)
      ? new URL(content.content)
      : content.content,
  } as AIMessageContent;
}

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
  // Use configured values or fallback to defaults
  const LOOP_TIMEOUT = config.getData().user.autonomous?.timeoutMs ?? 5 * 60 * 1000; // Default: 5 minutes
  const LOOP_MAX = config.getData().user.autonomous?.maxIterations ?? 10; // Default: 10 iterations

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
        role: msg.role,
        name: msg.name,
        tokens: msg.tokens,
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
    while (loopIteration < LOOP_MAX) {
      if (signal.aborted) {
        break;
      }

      // Check timeout
      if (Date.now() - startTime > LOOP_TIMEOUT) {
        const timeoutMinutes = Math.round(LOOP_TIMEOUT / 60000);
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

      // Override push to emit updates
      pending.operations!.push = function (...items: Operation[]) {
        const result = Array.prototype.push.apply(this, items);
        onEvent({ type: 'pendingUpdate', message: { ...pending } });
        return result;
      };

      // Emit initial pending message
      onEvent({ type: 'pendingUpdate', message: { ...pending } });

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
      for await (const chunk of chatResponse) {
        if (signal.aborted) {
          break;
        }

        switch (chunk.type) {
          case 'textPartial':
            pending.content[0].content += chunk.content;
            setOutputTokens(Math.ceil(pending.content[0].content.length / 4));
            onEvent({ type: 'pendingUpdate', message: { ...pending } });
            onEvent({ type: 'status', status: '' });
            break;

          case 'textComplete':
            pending.content[0].content = chunk.content;
            onEvent({ type: 'pendingUpdate', message: { ...pending } });
            break;

          case 'complete':
            pending.content[0].content = chunk.output;
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
                chatData.save((chat) => {
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
      currentMessages.push(pending);
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
