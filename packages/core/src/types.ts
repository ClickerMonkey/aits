import z from "zod";
import { resolve, Resolved } from "./common";
import { AnyPrompt, PromptEvent } from "./prompt";

/**
 * Utility type for representing tuples (arrays with at least zero elements).
 *
 * @template T - The element type of the tuple.
 */
export type Tuple<T> = [] | [T, ...T[]];

/**
 * Extracts the required keys from an object type.
 *
 * @template T - The object type to extract required keys from.
 */
export type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K
}[keyof T];

/**
 * Converts function parameters into optional arguments if they have no required keys.
 * This allows methods to accept optional parameters elegantly.
 *
 * @template P - The parameter tuple type.
 * @example
 * function<A, B, C>(...[a, b, c]: OptionalParams<[A, B, C]>): void
 */
export type OptionalParams<P> =
  P extends []
    ? []
    : P extends [infer F]
      ? RequiredKeys<F> extends never ? [param?: F] : [param: F]
      : P extends [...infer F, infer R]
        ? RequiredKeys<R> extends never
          ? [...OptionalParams<F>, param?: R]
          : [...F, R]
        : never;

/**
* The base interface for AI components.
* 
* @template TName - The name of the component, typed for inference in parent components.
* @template TInput - The input type for the component.
* @template TOutput - The output type for the component.
* @template TContext - The context type needed for the component's operation.
* @template TMetadata - The metadata type needed during execution/streaming.
*/
export interface Component<
  TContext = {},
  TMetadata = {},
  TName extends string = string,
  TInput extends object = {},
  TOutput = string,
  TRefs extends Tuple<Component<TContext, TMetadata, any, any, any, any>> = [],
> {

  /**
   * The component kind/type. Base kinds are prompt, tool, and agent.
   */
  kind: string;
  
  /**
  * The name of the component. Typed so parent components can infer child component names.
  */
  name: TName;
  
  /**
  * A brief description of the component.
  * 
  * This may or may not be used directly by the component or its parents, but is useful for documentation and understanding the component's purpose.
  */
  description: string;
  
  /**
  * References to other components that this component depends on.
  * 
  * Useful for understanding the potential hierarchy or graph of components.
  */
  refs: TRefs;
  
  /**
  * Executes the component with the given context and input.
  * 
  * @param ctx - The context for the component's operation.
  * @param input - The input for the component.
  * @returns A promise that resolves to the output of the component.
  */
  run(...[input, ctx]: OptionalParams<[TInput, Context<TContext, TMetadata>]>): TOutput;

  /**
   * Determines if the component is applicable in the given context.
   * 
   * @param ctx - The context to check applicability against.
   */
  applicable(...[ctx]: OptionalParams<[Context<TContext, TMetadata>]>): Promise<boolean>;
}

/**
 * A type representing any AI component that is compatible with the given context and metadata.
 */
export type ComponentCompatible<TContext, TMetadata> = Component<TContext, TMetadata, any, any, any, any>;

/**
 * A type representing any AI component.
 */
export type AnyComponent = Component<any, any, any, any, any, any>;

/**
 * Extracts contact type from a given AI component.
 */
export type ComponentContext<C extends AnyComponent> = C extends Component<infer TContext, infer t0, infer t1, infer t2, infer t3, infer t4> ? TContext : {};

/**
 * Extracts metadata type from a given AI component.
 */
export type ComponentMetadata<C extends AnyComponent> = C extends Component<infer t0, infer TMetadata, infer t1, infer t2, infer t3, infer t4> ? TMetadata : {};

/**
 * Extracts input type from a given AI component.
 */
export type ComponentInput<C extends AnyComponent> = C extends Component<infer t0, infer t1, infer t2, infer TInput, infer t3, infer t4> ? TInput : never;

/**
 * Extracts output type from a given AI component.
 */
export type ComponentOutput<C extends AnyComponent> = C extends Component<infer t0, infer t1, infer t2, infer t3, infer TOutput, infer t4> ? TOutput : never;

/**
 * Extracts refs type from a given AI component.
 */
export type ComponentRefs<C extends AnyComponent> = C extends Component<infer t0, infer t1, infer t2, infer t3, infer t4, infer TRefs> ? TRefs : never;

/**
 * All components referenced directly or indirectly by a given component.
 */
export type ComponentsAll<C extends AnyComponent> = C extends Component<infer t0, infer t1, infer t2, infer t3, infer t4, infer TRefs>
  ? TRefs[number] | ComponentsAll<TRefs[number]>
  : never;

/**
 * Extracts the names of a tuple of components.
 */
export type Names<T extends Tuple<AnyComponent>> = 
  T extends Tuple<infer C extends Component<infer t0, infer t1, infer TName, infer t2, infer t3, infer t4>>
    ? TName
    : never;

/**
 * Function type for executing AI requests synchronously (non-streaming).
 *
 * @template TContext - The context type for the request.
 * @template TMetadata - The metadata type for the request.
 * @param request - The AI request parameters.
 * @param context - The context for the request.
 * @param metadata - Optional metadata for the request.
 * @param signal - Optional abort signal for cancellation.
 * @returns A promise resolving to the complete AI response.
 */
export type Executor<
  TContext,
  TMetadata
> = (request: Request, context: TContext, metadata?: TMetadata, signal?: AbortSignal) => Promise<Response>;

/**
 * Function type for executing AI requests with streaming support.
 *
 * @template TContext - The context type for the request.
 * @template TMetadata - The metadata type for the request.
 * @param request - The AI request parameters.
 * @param context - The context for the request.
 * @param metadata - Optional metadata for the request.
 * @param signal - Optional abort signal for cancellation.
 * @returns An async generator yielding response chunks and returning the final response.
 */
export type Streamer<
  TContext,
  TMetadata
> = (request: Request, context: TContext, metadata?: TMetadata, signal?: AbortSignal) => AsyncGenerator<Chunk, Response>;

/**
* The context type for AI components, combining TContext and the inputs this AI system requires to operate.
*/
export type Context<TContext, TMetadata> = TContext & 
{
  /**
   * Messages in the context
   */
  messages?: Message[];

  /**
  * Executor and Streamer for this context
  */
  execute?: Executor<TContext, TMetadata>;
  
  /**
  * Streamer for this context
  */
  stream?: Streamer<TContext, TMetadata>;

  /**
   * An optional AbortSignal to cancel operations.
   */
  signal?: AbortSignal;

  /**
   * An optional function to estimate token usage for a message. 
   * 
   * If this is not provided, and the message has no tokens - it will the average available tokens per message.
   * 
   * @param message - The message to estimate tokens for.
   * @returns The estimated number of tokens.
   */
  estimateTokens?: (messages: Message) => number | undefined;

  /**
   * The default number of completion tokens to reserve when calculating available prompt tokens.
   */
  defaultCompletionTokens?: number;

  /**
   * The current instance of the component being executed, if any.
   */
  instance?: Instance<any>;

  /**
   * A custom component runner that can override how components are executed.
   */
  runner?: Runner;
}

/**
 * A custom component runner that can override how components are executed.
 * 
 * @param component - The component to run.
 * @param ctx - The context for the component's operation.
 * @param input - The input for the component.
 * @param getOutput - A function that returns the output of the component.
 * @returns 
 */
export type Runner = <C extends AnyComponent>(
  component: C, 
  input: ComponentInput<C>, 
  ctx: Context<ComponentContext<C>, ComponentMetadata<C>>, 
  // @ts-ignore
  getOutput: (ctx: Context<ComponentContext<C>, ComponentMetadata<C>>, events?: Events<C>) => ComponentOutput<C>
) => ComponentOutput<C>

/**
 * The role of a message in a conversation with an AI system.
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Represents a message in a conversation with an AI system.
 * Messages can come from different roles and contain various types of content.
 */
export interface Message
{
  /** The role of the message sender */
  role: MessageRole;
  /** Content can be a simple string or an array of structured content parts */
  content: string | MessageContent[];
  /** Number of tokens in the content, if known. Used for automatic trimming when token limits are exceeded. */
  tokens?: number;
  /** Optional name of the sender for the given role */
  name?: string;
  /** Used for tool call results (when role='tool') */
  toolCallId?: string;
  /** Used to acknowledge an assistant is running tools (when role='assistant') */
  toolCalls?: ToolCall[];
  /** Used for refusals (when role='assistant') */
  refusal?: string;
  /** Used to pass cache data along with the message */
  cache?: Record<string, any>;
}

/**
 * The type of content within a message.
 */
export type MessageContentType = 'text' | 'image' | 'file' | 'audio';

/**
 * Structured content part within a message.
 * Supports multiple content types including text, images, files, and audio.
 */
export interface MessageContent
{
  /** The type of content */
  type: MessageContentType;
  /** The actual content data */
  content: string | Buffer | URL | ReadableStream<Uint8Array | string>;
  /** Format of the content if known (e.g., 'png', 'mp3', 'pdf') */
  format?: string;
}

/**
 * Defines a tool that can be called by the AI system.
 * Tools extend the AI's capabilities by allowing it to interact with external systems.
 */
export interface ToolDefinition
{
  /** Tool name, must be unique within the request */
  name: string;
  /** Description of what the tool does */
  description?: string;
  /** Zod schema defining the tool's input parameters */
  parameters: z.ZodType<object>;
}

/**
 * Represents a tool invocation by the AI system.
 * The AI provides the tool name and arguments, which are then executed and results returned.
 */
export interface ToolCall
{
  /** Unique identifier for this tool call, used to match results back to the request */
  id: string;
  /** Name of the tool to call */
  name: string;
  /** The arguments for the tool call as a JSON string */
  arguments: string;
}

/**
 * Tool choice options.
 * 
 * - `auto`: Let the model decide whether to use a tool or not.
 * - `none`: Do not use any tools.
 * - `required`: Use a tool for this request.
 * - `{ tool: 'name' }`: Specify a particular tool to use by name.
 */
export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { tool: string };

/**
* Response format options.
* 
* - `text`: Plain text response.
* - `json`: JSON formatted response.
* - `z.ZodType<object, object>`: A Zod schema defining the expected response structure.
*/
export type ResponseFormat =
  | 'text'
  | 'json'
  | z.ZodType<object, object>;

/**
 * Statistics about usage for an AI request.
 * Includes token counts and optional cost information.
 */
export interface Usage
{
  /** Number of input tokens used (prompt) */
  inputTokens: number;
  /** Number of output tokens used (completion) */
  outputTokens: number;
  /** Total number of tokens used (input + output) */
  totalTokens: number;
  /** Number of cached tokens used, if applicable */
  cachedTokens?: number;
  /** Number of reasoning tokens used, if applicable (for reasoning models) */
  reasoningTokens?: number;
  /** Cost of the request in dollars, if calculated by the provider */
  cost?: number;
}

/**
 * @deprecated Use Usage instead
 */
export type TokenUsage = Usage;

/**
 * Effort level for reasoning-capable AI models.
 * Higher effort may produce better results but takes longer and uses more tokens.
 */
export type ReasoningEffort = 'low' | 'medium' | 'high';

/**
 * Parameters for an AI request.
 * Configures the model's behavior, available tools, and output format.
 */
export interface Request
{
  /** Optional name to identify the request. Could be the component name. */
  name?: string;
  /** Messages in the conversation history */
  messages: Message[];
  /** Temperature setting for response generation (0.0 to 2.0, higher = more random) */
  temperature?: number;
  /** Maximum tokens for the output */
  maxTokens?: number;
  /** Nucleus sampling parameter (0.0 to 1.0) */
  topP?: number;
  /** Frequency penalty to reduce repetition (-2.0 to 2.0) */
  frequencyPenalty?: number;
  /** Presence penalty to encourage new topics (-2.0 to 2.0) */
  presencePenalty?: number;
  /** Stop sequences to end the response */
  stop?: string | string[];
  /** Tools available for this request */
  tools?: ToolDefinition[];
  /** Only use tools for this request, don't generate text responses */
  toolsOnly?: boolean;
  /** Maximum number of tool calls allowed */
  toolsMax?: number;
  /** Use tools one at a time instead of parallel execution */
  toolsOneAtATime?: boolean;
  /** Tool choice strategy for this request */
  toolChoice?: ToolChoice;
  /** The expected response format. Defaults to text. */
  responseFormat?: ResponseFormat;
  /** Reasoning configuration for reasoning-capable models */
  reason?: { effort?: ReasoningEffort, maxTokens?: number };
}

/**
 * Indicates why an AI response finished generating.
 *
 * - `stop`: Natural completion of the response
 * - `length`: Maximum token limit reached
 * - `tool_calls`: Model wants to call tools
 * - `content_filter`: Content was filtered by safety systems
 * - `refusal`: Model refused to respond
 */
export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'refusal';

/**
 * Complete response from an AI request.
 * Contains the generated content, any tool calls, and metadata about the response.
 */
export interface Response
{
  /** The main text content of the response */
  content: string;
  /** Any tool calls requested by the model */
  toolCalls?: ToolCall[];
  /** Why the response finished generating */
  finishReason: FinishReason;
  /** Refusal reason if the model declined to respond */
  refusal?: string;
  /** Reasoning trace for reasoning-capable models */
  reasoning?: string;
  /** Usage statistics for this request */
  usage: Usage;
}

/**
 * A chunk of a streaming AI response.
 * Chunks are sent incrementally as the model generates the response.
 *
 * Most fields are partial updates, except:
 * - `finishReason` is sent when the response is complete
 * - `toolCallNamed` is sent when a tool call name is fully received
 * - `toolCall` is sent when a tool call is fully received
 */
export interface Chunk {
  /** Partial text content received */
  content?: string;
  /** Sent when a tool call name is fully received */
  toolCallNamed?: ToolCall;
  /** Sent as tool call arguments are being streamed */
  toolCallArguments?: ToolCall;
  /** Sent when a tool call is fully received */
  toolCall?: ToolCall;
  /** Sent when the response is finished */
  finishReason?: FinishReason;
  /** Partial refusal reason */
  refusal?: string;
  /** Partial reasoning trace */
  reasoning?: string;
  /** Usage statistics (sent at the end) */
  usage?: Usage;
}

/**
 * A status of an instance of a component.
 * 
 * - `pending` is the first status emitted immediately
 * - `running` is the status emitted once input has been evaluated and actual component execution is about to be ran. started is set at this time.
 * - `completed` is the status emitted on success, completed & output are set here.
 * - `failed` is the status emitted on complete failure, completed & error are set here.
 * - `interuppted` is the status emitted while it was running and an interrupt signal was sent, completed & error are set here.
 */
export type InstanceStatus = 'pending' | 'running' | 'completed' | 'failed' | 'interrupted';

/**
 * An instance of a component execution.
 */
export interface Instance<C extends AnyComponent> 
{
  // The parent of this instance, if any
  parent?: Instance<AnyComponent>;
  // A unique identifier for this instance within a scope
  id: string;
  // The component being executed
  component: C;
  // The context for this instance
  context: ComponentContext<C>;
  // The input for this instance
  input: ComponentInput<C>;
  // The current status of this instance
  status: InstanceStatus;
  // Timestamps for tracking execution
  started?: number;
  // The time the instance started running
  running?: number;
  // The time the instance completed
  completed?: number;
  // Any error that occurred during execution
  error?: any;
  // The output of the instance, if completed successfully
  output?: Resolved<ComponentOutput<C>>;
  // Child instances, if any
  children?: Instance<ComponentRefs<C>>[];
}

/**
 * Events related to component instances.
 */
export interface Events<
  TRoot extends AnyComponent, 
  TNodes extends ComponentsAll<TRoot> = ComponentsAll<TRoot>
> {
  // An event when the status of a node changes
  onStatus?: (node: Instance<TNodes>) => void;
  // An event when a child instance is created
  onChild?: <N extends TNodes>(node: Instance<N>, child: Instance<ComponentRefs<N>>) => void;
  // An event when a prompt node generates a new prompt event
  onPromptEvent?: <N extends Extract<TNodes, AnyPrompt>>(instance: Instance<N>, event: PromptEvent<ComponentOutput<N>, ComponentRefs<N>>) => void;
}

/**
 * Creates a runner that emits events during component execution.
 * 
 * @param events 
 * @returns 
 */ // @ts-ignore
export function withEvents<TRoot extends AnyComponent>(events: Events<TRoot>): Runner {
  let instanceIndex = 0;
  const runner: Runner = (component, input, context, getOutput) => {
    type C = typeof component;

    const instanceContext = { ...context };

    const instance: Instance<C> = {
      id: `${component.kind}:${component.name}:${instanceIndex++}`,
      parent: context.instance,
      component,
      context: instanceContext,
      input,
      status: 'pending',
    };

    instanceContext.instance = instance;

    if (instance.parent) {
      // @ts-ignore
      events.onChild?.(instance.parent, instance);
    }

    // @ts-ignore
    events.onStatus?.(instance);

    instance.status = 'running';
    instance.started = Date.now();

    const output = getOutput(instanceContext, events);
    const resolved = resolve(output);

    resolved.then((result) => {
      instance.status = 'completed';
      instance.completed = Date.now();
      instance.output = result;

      // @ts-ignore
      events.onStatus?.(instance);
    }, (error) => {
      if (instanceContext.signal?.aborted) {
        instance.status = 'interrupted';
      } else {
        instance.status = 'failed';
      }
      instance.completed = Date.now();
      instance.error = error;

      // @ts-ignore
      events.onStatus?.(instance);
    });

    return output;
  };

  return runner;
}