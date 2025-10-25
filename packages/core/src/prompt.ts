import Handlebars from "handlebars";
import z from 'zod';

import { accumulateUsage, Fn, resolve, Resolved, resolveFn, yieldAll } from "./common";
import { AnyTool, Tool, ToolCompatible } from "./tool";
import { Component, Context, Events, Executor, FinishReason, Message, Names, OptionalParams, Request, RequiredKeys, ResponseFormat, Streamer, ToolCall, ToolDefinition, Tuple, Usage } from "./types";

/**
 * Input provided to the prompt reconfiguration function.
 * 
 * This allows the prompt to adjust its configuration based on runtime statistics.
 */
export interface PromptReconfigInput {
  iteration: number;
  toolParseErrors: number;
  toolCallErrors: number;
  tools: string[];
  toolSuccesses: number;
}

/**
 * Reconfiguration options for a prompt during execution.
 */
export interface PromptReconfig {
  config?: Partial<Request>;
  maxIterations?: number;
}

/**
 * Input structure for defining a prompt.
 * 
 * @template TContext - The context type needed for the prompt's operation.
 * @template TMetadata - The metadata type needed during execution/streaming.
 * @template TName - The name of the prompt, typed for inference in parent components.
 * @template TInput - The input type for the prompt.
 * @template TOutput - The output type for the prompt.
 * @template TTools - The tools available to the prompt.
 */
export interface PromptInput<
  TContext = {},
  TMetadata = {},
  TName extends string = string,
  TInput extends object = {},
  TOutput extends object | string = string,
  TTools extends Tuple<ToolCompatible<TContext, TMetadata>> = [],
> {
  // The name of the prompt.
  name: TName;
  // A brief description of the prompt (not used directly).
  description: string;
  // A string defining the prompt content in Handlebars format.
  content: string;
  // An object or function/promise that returns an object for the variables that are injected into the prompt content.
  input?: Fn<Record<string, any>, [TInput | undefined, Context<TContext, TMetadata>]>;
  // A schema or function/promise that returns a schema defining the expected output format of the prompt. If not provided, defaults to plain text.
  schema?: Fn<z.ZodType<TOutput> | false, [TInput | undefined, Context<TContext, TMetadata>]>;
  // A configuration object or function/promise that returns a configuration object for the AI request.
  config?: Fn<Partial<Request> | false, [TInput | undefined, Context<TContext, TMetadata>]>;
  // After an iteration, a function that can reconfigure the prompt based on runtime statistics.
  reconfig?: (stats: PromptReconfigInput, ctx: Context<TContext, TMetadata>) => PromptReconfig | Promise<PromptReconfig>;
  // An array of tools available to the prompt.
  tools?: TTools;
  // When the tools should execute (defaults to immediate).
  // - sequential: wait for each tool to finish before continuing
  // - parallel: start all tools at once and wait for all to finish
  // - immediate: start tools as soon as they are available
  toolExecution?: 'sequential' | 'parallel' | 'immediate';
  // A function/promise that returns an array of tool names to use, or false to indicate the prompt is not compatible with the context.
  retool?: Fn<Names<TTools>[] | false, [TInput | undefined, Context<TContext, TMetadata>]>;
  // Metadata about the prompt to be passed during execution/streaming. Typically contains which model, or requirements, etc.
  metadata?: TMetadata;
  // If messages on the context should be excluded when rendering the prompt.
  excludeMessages?: boolean;
  // Optional post-validation hook that runs after Zod parsing succeeds on the final output. Can throw to trigger re-prompting.
  validate?: (output: TOutput, ctx: Context<TContext, TMetadata>) => void | Promise<void>;
  // Optional function to determine if the component is applicable in the given context. If this is defined it is used over the default check.
  applicable?: (ctx: Context<TContext, TMetadata>) => boolean | Promise<boolean>;
  // Optional way to explicitly declare the types used in this component.
  types?: {
    input?: TInput;
    output?: TOutput;
    context?: TContext;
    metadata?: TMetadata;
  },
}

/**
 * Converts TTools into:
 * 
 * { tool: 'name1', result: Result1 } | { tool: 'name2', result: Result2 } | ...
 */
export type PromptToolOutput<TTools extends AnyTool[]> =
  TTools extends Array<infer TI>
    ? TI extends Tool<any, any, infer TName, any, infer TO, any>
      ? { tool: TName, result: TO }
      : never
    : never
;

/**
 * Converts TTools into a union of their names:
 * 
 * 'name1' | 'name2' | ...
 */
export type PromptToolNames<TTools extends AnyTool[]> =
  TTools extends Tool<any, any, infer TName, any, any, any>[]
    ? TName
    : never
;

/**
 * Convers TTools (tuple [T1, T2, ...]) into a single tool type (union T1 | T2 | ...)
 */
export type PromptTools<TTools extends AnyTool[]> =
  TTools extends (infer TTool)[]
    ? TTool
    : never
;

/**
 * Converts TTools into tool-related events:
 * 
 * { type: 'toolStart', tool: TTool, args: any } |
 * { type: 'toolOutput', tool: TTool, args: any, result: TOutput } |
 * { type: 'toolError', tool: TTool, args: any, error: string }
 */
export type PromptToolEvents<TTools extends Tuple<AnyTool>> =
  TTools extends Array<infer TTool>
    ? TTool extends Tool<infer t0, infer t1, infer t2, infer t3, infer TOutput, infer t4>
      ? { type: 'toolStart', tool: TTool, args: any }
      | { type: 'toolOutput', tool: TTool, args: any, result: Resolved<TOutput> }
      | { type: 'toolError', tool: TTool, args: any, error: string }
      : never
    : never;

/**
 * The events emitted during prompt execution/streaming.
 */
export type PromptEvent<TOutput, TTools extends Tuple<AnyTool>> =
  { type: 'textPartial', content: string } |
  { type: 'refusal', content: string } |
  { type: 'reason', content: string } |
  { type: 'reasonPartial', content: string } |
  { type: 'toolParseName', tool: PromptTools<TTools> } |
  { type: 'toolParseArguments', tool: PromptTools<TTools>, args: string } |
  PromptToolEvents<TTools> |
  { type: 'textComplete', content: string } |
  { type: 'complete', output: TOutput } |
  { type: 'textReset', reason?: string } |
  { type: 'requestTokens', tokens: number } |
  { type: 'responseTokens', tokens: number } |
  { type: 'usage', usage: Usage };

/**
 * A type representing any prompt component.
 */
export type AnyPrompt = Prompt<any, any, any, any, any, any>;

/**
 * A Prompt component that generates AI responses based on input, context, and available tools.
 * Prompts orchestrate interactions with AI models, handle tool calls, and manage streaming responses.
 *
 * @template TContext - The context type needed for the prompt's operation.
 * @template TMetadata - The metadata type needed during execution/streaming.
 * @template TName - The name of the prompt, typed for inference in parent components.
 * @template TInput - The input type for the prompt.
 * @template TOutput - The output type for the prompt.
 * @template TTools - The tools available to the prompt.
 *
 * @example
 * const summarizer = new Prompt({
 *   name: 'summarize',
 *   description: 'Summarizes text',
 *   content: 'Summarize the following text:\n\n{{text}}',
 *   input: (input) => ({ text: input.text }),
 *   schema: z.object({ summary: z.string() }),
 * });
 *
 * const result = await summarizer.get({ text: 'Long text here...' });
 */
export class Prompt<
  TContext = {},
  TMetadata = {},
  TName extends string = string,
  TInput extends object = {},
  TOutput extends object | string = string,
  TTools extends Tuple<ToolCompatible<TContext, TMetadata>> = [],
> implements Component<
  TContext,
  TMetadata,
  TName,
  TInput,
  AsyncGenerator<PromptEvent<TOutput, TTools>, TOutput | undefined, unknown>,
  TTools
> {

  /**
   * Compiles the prompt content template.
   * Automatically appends tool instructions section if tools are available.
   *
   * @param content - The prompt content template string.
   * @param hasTools - Whether tools are available.
   * @returns A compiled Handlebars template function.
   */
  static compileContent(content: string, hasTools: boolean) {
    let template = content;
    if (hasTools && !template.includes('{{tools}}')) {
      template = template + "\n\n<tools>\n{{tools}}\n</tools>";
    }
    return Handlebars.compile(template);
  }

  constructor(
    public input: PromptInput<TContext, TMetadata, TName, TInput, TOutput, TTools>,
    private retool = resolveFn(input.retool),
    private schema = resolveFn(input.schema),
    private config = resolveFn(input.config),
    private translate = resolveFn(input.input),
    private content = Prompt.compileContent(input.content, !!input.tools?.length),
  ) {
  }

  get kind(): 'prompt' {
    return 'prompt';
  }

  get name(): TName {
    return this.input.name;
  }

  get description(): string {
    return this.input.description;
  }

  get refs(): TTools {
    return this.input.tools || [] as unknown as TTools;
  }

  /**
   * Retrieves the prompt output in various modes.
   *
   * - `result`: Returns the final output only
   * - `tools`: Returns all tool outputs only
   * - `stream`: Streams all prompt events
   * - `streamTools`: Streams only tool output events
   * - `streamContent`: Streams only text content events
   *
   * @param input - The input parameters for the prompt.
   * @param mode - The mode of output to retrieve. Defaults to 'result'.
   * @param ctx - The context for the prompt's operation.
   * @returns The prompt output based on the specified mode.
   * @example
   * // Get final result
   * const result = await prompt.get({ text: 'hello' });
   *
   * // Stream content
   * for await (const chunk of prompt.get({ text: 'hello' }, 'streamContent')) {
   *   console.log(chunk);
   * }
   */
  // public async get(input: TInput): Promise<TOutput> 
  // public async get(...[input, mode, context]: OptionalParams<[TInput, 'result' | undefined, Context<TContext, TMetadata>]>): Promise<TOutput>

  public get(): RequiredKeys<TInput> extends never ? RequiredKeys<TContext> extends never ? Promise<TOutput> : never : never;
  public get(input: TInput): RequiredKeys<TContext> extends never ? Promise<TOutput> : never;
  public get(input: TInput, mode: 'result'): RequiredKeys<TContext> extends never ? Promise<TOutput> : never;
  public get(input: TInput, mode: 'result', context: Context<TContext, TMetadata>): Promise<TOutput>;
  public get(input: TInput, mode: 'tools', ...[context]: OptionalParams<[Context<TContext, TMetadata>]>): Promise<PromptToolOutput<TTools>[] | undefined>
  public get(input: TInput, mode: 'stream', ...[context]: OptionalParams<[Context<TContext, TMetadata>]>): AsyncGenerator<PromptEvent<TOutput, TTools>, TOutput | undefined, unknown>
  public get(input: TInput, mode: 'streamTools', ...[context]: OptionalParams<[Context<TContext, TMetadata>]>): AsyncGenerator<PromptToolOutput<TTools>, TOutput | undefined, unknown>
  public get(input: TInput, mode: 'streamContent', ...[context]: OptionalParams<[Context<TContext, TMetadata>]>): AsyncGenerator<string, TOutput | undefined, unknown>
  public get(
    input: TInput = {} as TInput,
    mode: 'result' | 'tools' | 'stream' | 'streamTools' | 'streamContent' = 'result',
    ctx: Context<TContext, TMetadata> = {} as Context<TContext, TMetadata>,
  ): 
    Promise<PromptToolOutput<TTools>[] | TOutput | undefined> |
    AsyncGenerator<PromptEvent<TOutput, TTools> | PromptToolOutput<TTools> | string, TOutput | undefined, unknown>
  {
    const stream = this.stream(input, mode.startsWith('stream'), undefined, ctx);

    switch (mode) {
    case 'result':
      return (async function() {
        for await (const event of stream) {
          if (event.type === 'complete') {
            return event.output;
          }
        }
      })();
    case 'tools':
      return (async function() {
        const tools: PromptToolOutput<TTools>[] = [];
        for await (const event of stream) {
          if (event.type === 'toolOutput') {
            tools.push({ tool: event.tool.name, result: event.result } as PromptToolOutput<TTools>);
          }
        }
        return tools;
      })();
    case 'stream':
      return (async function*() {
        let output: TOutput | undefined = undefined;
        for await (const event of stream) {
          yield event;
          if (event.type === 'complete') {
            output = event.output;
          }
        }
        return output;
      })();
    case 'streamTools':
      return (async function*() {
        let output: TOutput | undefined = undefined;
        for await (const event of stream) {
          if (event.type === 'toolOutput') {
            yield { tool: event.tool.name, result: event.result } as PromptToolOutput<TTools>;
          }
          if (event.type === 'complete') {
            output = event.output;
          }
        }
        return output;
      })();
    case 'streamContent':
      return (async function*() {
        let output: TOutput | undefined = undefined;
        for await (const event of stream) {
          if (event.type === 'textPartial') {
            yield event.content;
          }
          if (event.type === 'complete') {
            output = event.output;
          }
        }
        return output;
      })();
    }
  }

  /**
   * Runs the prompt with the given context and input.
   * 
   * @param ctx - The context for the prompt's operation.
   * @param input - The input parameters for the prompt.
   * @returns An async generator yielding prompt events and ultimately the final output.
   */
  run(...[inputMaybe, contextMaybe]: OptionalParams<[TInput, Context<TContext, TMetadata>]>): AsyncGenerator<PromptEvent<TOutput, TTools>, TOutput | undefined, unknown> {
    const input = (inputMaybe || {}) as TInput;
    const ctx = (contextMaybe || {}) as Context<TContext, TMetadata>;
    const prompt = this as Component<TContext, TMetadata, TName, TInput, AsyncGenerator<PromptEvent<TOutput, TTools>, TOutput | undefined, unknown>, TTools>;

    return ctx.runner
      // @ts-ignore
      ? ctx.runner(prompt, input, ctx, (innerCtx, events) => this.stream(input, true, events, innerCtx))
      : this.stream(input, true, undefined, ctx);
  }

  /**
   * Determines if the prompt is applicable in the given context.
   * By default, checks retool, schema, and config functions if provided.
   * 
   * @param ctx - The context to check applicability against.
   * @returns Whether the prompt is applicable.
   */
  async applicable(...[contextMaybe]: OptionalParams<[Context<TContext, TMetadata>]>): Promise<boolean> {
    const ctx = (contextMaybe || {}) as Context<TContext, TMetadata>;

    if (this.input.applicable) {
      return this.input.applicable(ctx);
    }
    if (this.input.retool && await this.retool(undefined, ctx) === false) {
      return false;
    }
    if (this.input.schema && await this.schema(undefined, ctx) === false) {
      return false;
    } 
    if (this.input.config && await this.config(undefined, ctx) === false) {
      return false;
    }
    return true;
  }

  /**
   * Streams the prompt execution, yielding events as they occur.
   * This is the core execution method that handles AI interaction, tool calling, and response parsing.
   *
   * @param input - The input parameters for the prompt.
   * @param preferStream - Whether to prefer streaming execution over batch execution.
   * @param events - Optional event handlers for prompt events.
   * @param ctx - The context for the prompt's operation.
   * @returns An async generator yielding prompt events and ultimately the final output.
   */
  async* stream(
    ...[inputMaybe, preferStream = true, eventsMaybe, contextMaybe]: OptionalParams<[
      TInput,
      boolean,
      Events<Component<TContext, TMetadata, TName, TInput, AsyncGenerator<PromptEvent<TOutput, TTools>, TOutput | undefined, unknown>, TTools>> | undefined,
      Context<TContext, TMetadata>, 
    ]>
  ): AsyncGenerator<PromptEvent<TOutput, TTools>, TOutput | undefined, unknown> {
    const input = (inputMaybe || {}) as TInput;
    const events = (eventsMaybe || {}) as Events<Component<TContext, TMetadata, TName, TInput, AsyncGenerator<PromptEvent<TOutput, TTools>, TOutput | undefined, unknown>, TTools>>;
    const ctx = (contextMaybe || {}) as Context<TContext, TMetadata>;

    const streamer = ctx.stream && preferStream 
      ? ctx.stream
      : ctx.execute
        ? this.streamify(ctx.execute)
        : undefined;

    if (!streamer) {
      throw new Error(`No executor or streamer available in context for prompt ${this.input.name}`);
    }
    
    const resolved = await this.resolve(ctx, input);
    if (!resolved) {
      return undefined;
    }

    const { config, content, tools, toolObjects, responseFormat, schema } = resolved;
    const toolMode = this.input.toolExecution || 'immediate';
    const toolMap = new Map<string, { tool: PromptTools<TTools>, definition: ToolDefinition }>(
      toolObjects?.map(({ tool, definition }) => [tool.name, { tool, definition }] as any) || []
    );

    const request: Request = {
      name: this.name,
      ...config,
      messages: [
        { role: 'system', content },
      ],
      tools,
      responseFormat,
    };

    if (!this.input.excludeMessages && ctx.messages) {
      request.messages = request.messages.concat(ctx.messages);
    }

    let result: TOutput | undefined = undefined;
    let lastError: string | undefined = undefined;
    let completeText: string = '';
    let maxIterations = request.toolsMax ?? 10;
    let requestTokensSent = false;
    let usage: Usage | undefined = undefined;
    let iterations = 0;
    let accumulatedUsage: Usage = {};

    // Track stats for reconfig
    let toolParseErrors = 0;
    let toolCallErrors = 0;
    let toolSuccesses = 0;
    const toolsCalled = new Set<string>();

    // Emit is a helper to optionally emit events and return the value passed in so it can be yielded.
    const emit = events?.onPromptEvent && ctx.instance
      ? (ev: PromptEvent<TOutput, TTools>) => {
          // @ts-ignore
          events.onPromptEvent!(ctx.instance!, ev as any);
          return ev;
        }
      : (ev: PromptEvent<TOutput, TTools>) => ev;

    // Main execution loop!
    while (iterations <= maxIterations) {
      const toolCalls: ToolExecution<PromptTools<TTools>>[] = [];
      const toolCallMap = new Map<string, ToolExecution<PromptTools<TTools>>>();

      let finishReason: FinishReason | undefined = undefined;
      let refusal = '';
      let reasoning = '';
      let content = '';

      const streamSignal = new AbortController();
      ctx.signal?.addEventListener('abort', () => {
        streamSignal.abort();
      });

      const stream = streamer(request, ctx, this.input.metadata, streamSignal.signal);

      for await (const chunk of stream) {
        if (chunk.usage) {
          usage = chunk.usage;
          if (!requestTokensSent) {
            yield emit({ type: 'requestTokens', tokens: chunk.usage.inputTokens ?? 0 });
            requestTokensSent = true;
          }
          accumulateUsage(accumulatedUsage, chunk.usage);
        }

        if (chunk.content) {
          content += chunk.content;
          yield emit({ type: 'textPartial', content: chunk.content });
        }

        if (chunk.refusal) {
          refusal += chunk.refusal;
          yield emit({ type: 'textPartial', content: chunk.refusal });
        }

        if (chunk.reasoning) {
          reasoning += chunk.reasoning;
          yield emit({ type: 'reasonPartial', content: chunk.reasoning });
        }

        // Handle tool calls
        if (chunk.toolCallNamed) {
          const toolCall = newToolExecution(ctx, chunk.toolCallNamed, toolMap.get(chunk.toolCallNamed.name));
          toolCalls.push(toolCall);
          toolCallMap.set(chunk.toolCallNamed.id, toolCall);
          
          if (toolCall.tool) {
            yield emit({ type: 'toolParseName', tool: toolCall.tool });
          } else {
            streamSignal.abort(toolCall.error);
            break;
          }
        }

        if (chunk.toolCallArguments) {
          const toolCall = toolCallMap.get(chunk.toolCallArguments.id)!;
          toolCall.toolCall = chunk.toolCallArguments;
  
          yield emit({ type: 'toolParseArguments', tool: toolCall.tool!, args: chunk.toolCallArguments.arguments });

          // Start parsing arguments immediately (but not right now)
          setImmediate(toolCall.parse);
        }

        if (chunk.toolCall) {
          const toolCall = toolCallMap.get(chunk.toolCall.id)!;
          toolCall.toolCall = chunk.toolCall;

          if (toolMode === 'immediate') {
            // Start execution immediately
            setImmediate(toolCall.run);
          }
        }

        if (chunk.finishReason) {
          finishReason = chunk.finishReason;
        }

        // In immediate mode we might be getting more chunks while executing, emit events as soon as possible.
        if (toolMode === 'immediate') {
          for (const toolCall of toolCalls) {
            if (toolCall.emitStart()) {
              yield emit({ type: 'toolStart', tool: toolCall.tool!, args: toolCall.args } as any);
            }
            if (toolCall.emitOutput()) {
              yield emit({ type: 'toolOutput', tool: toolCall.tool, args: toolCall.args, result: toolCall.result } as any);
            }
            if (toolCall.emitError()) {
              yield emit({ type: 'toolError', tool: toolCall.tool!, args: toolCall.args, error: toolCall.error } as any)
            }
          }
        }
      }

      // If the model reasoned, yield it
      if (reasoning) {
        yield emit({ type: 'reason', content: reasoning });
      }

      // If the model refused to answer and stop
      if (finishReason === 'refusal' || refusal) {
        yield emit({ type: 'refusal', content: refusal || 'unspecified' });
        lastError = refusal || 'Model refused to answer.';
        break;
      }

      // If the model was stopped due to content filtering
      if (finishReason === 'content_filter') {
        yield emit({ type: 'refusal', content: 'Content filtered by AI model' });
        lastError = 'Model response was filtered due to content policy.';
        break;
      }

      // If we sent too much, forget the past homie 
      if (finishReason === 'length') {
        if (usage) {
          request.messages = this.forget(request, ctx, usage)

          yield emit({ type: 'textReset', reason: 'length' });

          // Lets retry immediately
          continue;          
        } else {
          // Stop iteration - we can't trim without usage info
          lastError = 'Model indicated length finish reason but no token usage was provided so context cannot be trimmed.';
          break;
        }
      }

      // If we need to make some tool calls, lets do it!
      if (finishReason === 'tool_calls' && toolCalls.length) {
        // Add the assistant's response with tool calls to the conversation
        request.messages.push({
          role: 'assistant',
          content,
          toolCalls: toolCalls.map(tc => tc.toolCall),
        });

        // If there are any error/invalid - just stop and add their errors and retry
        let skip = false;
        for (const toolCall of toolCalls) {
          if (toolCall.error) {
            skip = true;
          } else {
            // Non-blocking call, we don't want to hold up execution here. But if we can emit start or error early below this we will try.
            toolCall.parse();
          }
          if (toolCall.emitStart()) {
            yield emit({ type: 'toolStart', tool: toolCall.tool!, args: toolCall.args } as any);
          }
          if (toolCall.emitError()) {
            yield emit({ type: 'toolError', tool: toolCall.tool!, args: toolCall.args, error: toolCall.error } as any)
          }
        }

        // The execution mode for this iteration.
        const iterationMode = skip ? 'skip' : toolMode;

        // All tool calls are valid, lets start this!
        switch (iterationMode) {
          case 'sequential':
            for (const toolCall of toolCalls) {
              await toolCall.parse();
              if (toolCall.emitStart()) {
                yield emit({ type: 'toolStart', tool: toolCall.tool!, args: toolCall.args } as any);
              }
              await toolCall.run();
              if (toolCall.emitOutput()) {
                yield emit({ type: 'toolOutput', tool: toolCall.tool, args: toolCall.args, result: toolCall.result } as any);
              }
              if (toolCall.emitError()) {
                yield emit({ type: 'toolError', tool: toolCall.tool!, args: toolCall.args, error: toolCall.error } as any)
              }
            }
            break;
          case 'parallel':
          case 'immediate':
            const parseRuns = toolCalls.map(tc => [tc.parse(), tc.run()]).flat();
            for await (const { result: toolCallPromise } of yieldAll(parseRuns)) {
              const toolCall = await toolCallPromise;
              if (toolCall.emitStart()) {
                yield emit({ type: 'toolStart', tool: toolCall.tool!, args: toolCall.args } as any);
              }
              if (toolCall.emitOutput()) {
                yield emit({ type: 'toolOutput', tool: toolCall.tool, args: toolCall.args, result: toolCall.result } as any);
              }
              if (toolCall.emitError()) {
                yield emit({ type: 'toolError', tool: toolCall.tool!, args: toolCall.args, error: toolCall.error } as any)
              }
            }
            break;
        }

        for (const toolCall of toolCalls) {
          if (toolCall.result !== undefined || toolCall.error !== undefined) {
            request.messages.push({
              role: 'tool',
              content: toolCall.error || JSON.stringify(toolCall.result),
              toolCallId: toolCall.toolCall.id,
            });
          }
          if (toolCall.status === 'invalid') {
            toolParseErrors++;
          } else if (toolCall.status === 'error') {
            toolCallErrors++;
          } else if (toolCall.status === 'success') {
            toolSuccesses++;
          }
        }
      }

      // The only want tool calls, no further response.
      if (request.toolsOnly && toolSuccesses > 0) {
        // got what we needed!
        lastError = undefined;
        break;
      }

      // If we are finished, parse the output
      if (finishReason === 'stop' || (!toolCalls.length && content)) {
        completeText = content;
        
        if (!schema || (schema instanceof z.ZodString)) {
          result = content as unknown as TOutput;
        } else {
          // Grab the JSON part from the content just in case...
          const potentialJSON = content.substring(
            content.indexOf('{'),
            content.lastIndexOf('}') + 1
          );

          let errorMessage = '';
          let resetReason = '';
          try {
            const parsedJSON = JSON.parse(potentialJSON);

            const parsedSafe = schema.safeParse(parsedJSON);
            if (!parsedSafe.success) {
              const issueSummary = parsedSafe.error.issues
                .map(i => `- ${i.path.join('.')}: ${i.message}${['string', 'boolean', 'number'].includes(typeof i.input) ? ` (input: ${i.input})` : ''}`)
                .join('\n')
              errorMessage = `The output was an invalid format:\n${issueSummary}\n\nPlease adhere to the output schema:\n${z.toJSONSchema(schema)}`;
              resetReason = 'schema-parsing';
            } else {
              result = parsedSafe.data as unknown as TOutput;

              try {
                await this.input.validate?.(result, ctx);
              } catch (validationError: any) {
                errorMessage = `The output failed validation:\n${validationError.message}`;
                resetReason = 'validation';
              }
            }
          } catch (parseError: any) {
            errorMessage = `The output was not valid JSON:\n${parseError.message}`;
            resetReason = 'json-parsing';
          }

          if (errorMessage) {
            yield emit({ type: 'textReset', reason: resetReason });

            request.messages.push({
              role: 'user',
              content: errorMessage,
            });
          } else {
            // A result was successfully parsed and validated!
            lastError = undefined;
            break;
          }
        }
      }

      // Call reconfig if provided
      if (this.input.reconfig) {
        const stats: PromptReconfigInput = {
          iteration: iterations,
          toolParseErrors,
          toolCallErrors,
          toolSuccesses,
          tools: Array.from(toolsCalled),
        };
        const reconfigResult = await this.input.reconfig(stats, ctx);
        if (reconfigResult) {
          // Apply custom config if provided
          if (reconfigResult.config) {
            delete reconfigResult.config.messages;

            Object.assign(request, reconfigResult.config);
          }

          // Update maxIterations if provided
          if (reconfigResult.maxIterations !== undefined) {
            if (reconfigResult.maxIterations === 0) {
              // Stop immediately
              break;
            } else if (reconfigResult.maxIterations > 0) {
              maxIterations = iterations + reconfigResult.maxIterations;
            }
            // If undefined, keep the default maxIterations
          }
        }
      }

      // If we met our max tool calls, remove the tools from the request
      if (request.toolsMax && toolSuccesses >= request.toolsMax) {
        delete request.tools;
        // If tool_choice was required, remove it now that we're done with tools
        if (request.toolChoice === 'required') {
          delete request.toolChoice;
        }
      }

      // Lets go again!
      iterations++;
    }

    yield emit({ type: 'textComplete', content: completeText });

    // Yield token usage if available
    if (usage?.outputTokens) {
      yield emit({ type: 'responseTokens', tokens: usage.outputTokens });
    }

    yield emit({ type: 'usage', usage: accumulatedUsage });

    // We don't emit complete without a valid result unless toolsOnly is set
    if (result === undefined && !request.toolsOnly) {
      if (!lastError && iterations === maxIterations) {
        lastError = `Maximum iterations (${maxIterations}) reached without a valid response.`;
      }
      if (!lastError) {
        lastError = `Prompt ${this.input.name} failed without a specified error.`;
      }
      throw new Error(`Prompt ${this.input.name} failed: ${lastError}`);
    }

    yield emit({ type: 'complete', output: result! });

    return result!;
  }

  /**
   * Prepares the prompt for execution by resolving all configuration, tools, and templates.
   * Returns undefined if the prompt is not compatible with the given context.
   *
   * @param ctx - The context to prepare against.
   * @param input - The input to the prompt.
   * @returns The resolved prompt components or undefined if not compatible.
   */
  private async resolve(ctx: Context<TContext, TMetadata>, input: TInput) {
    // Get config, if false is returned context is not compatible with prompt
    const config = await this.config(input, ctx);
    if (config === false) {
      return undefined;
    }

    // Get prompt response schema, if false is returned context is not compatible with prompt
    const schema = await this.schema(input, ctx);
    if (schema === false) {
      return undefined;
    }

    // Determine if prompt can run based on tool compatibility with the context
    const retooling = await this.retool(input, ctx);
    if (retooling === false) {
      return undefined;
    }

    // Extract tools, their instructions, and schemas.
    const toolNames = this.input.retool && retooling
      ? new Set(retooling)
      : new Set(this.input.tools?.map(t => t.name) || []);
    const selectedTools = this.input.tools?.filter(t => toolNames.has(t.name));
    const toolInstructions = selectedTools
      ? (await Promise.all(selectedTools.map(t => t.compile(ctx)))).filter(t => !!t)
      : undefined;
    const instructions = toolInstructions
      ? toolInstructions.map(t => t![0]).join("\n\n")
      : undefined;
    const tools = toolInstructions
      ? toolInstructions.map(t => t![1])
      : undefined;

    // Create toolObjects as array of { tool, definition } pairs
    const toolObjects = selectedTools && toolInstructions
      ? selectedTools.map((tool, i) => ({ tool, definition: toolInstructions[i]![1] }))
      : [];

    // Compute the input that is fed to the prompt's prompt content
    let contentInput: Record<string, any> = input;
    const translated = await this.translate(input, ctx);
    if (translated) {
      contentInput = translated;
    }
    contentInput.tools = instructions;

    // Compute content using the compiled template
    const content = this.content(contentInput);

    // Determine response format
    const responseFormat: ResponseFormat = schema && !(schema instanceof z.ZodString)
      ? schema as z.ZodType<object, object>
      : 'text';

    return { config, content, tools, toolObjects, responseFormat, schema };
  }

  

  /**
   * Converts a non-streaming executor into a streamer by yielding response parts.
   * This allows uniform handling of streaming and non-streaming AI providers.
   *
   * @param execute - The executor function to convert.
   * @returns A streamer function that yields parts of the executor's response.
   */
  private streamify(execute: Executor<TContext, TMetadata>): Streamer<TContext, TMetadata> {
    return async function* (request, ctx, metadata, signal) {
      const response = await execute(request, ctx, metadata, signal);

      yield {
        reasoning: response.reasoning,
        refusal: response.refusal,
      };

      for (const toolCall of response.toolCalls || []) {
        yield { toolCallNamed: toolCall, toolCallArguments: toolCall, toolCall };
      }

      yield { 
        content: response.content,
        finishReason: response.finishReason,
        usage: response.usage,
      };

      return response;
    };
  }

  /**
   * Trims messages from the request to fit within token limits.
   * This is called automatically when the model returns a 'length' finish reason.
   *
   * @param request - The original request with messages.
   * @param ctx - The context containing message history and token estimation.
   * @param usage - The current token usage.
   * @returns The trimmed array of messages.
   */
  private forget(request: Request, ctx: Context<TContext, TMetadata>, usage: Usage): Message[] {
    // If we don't have token usage info, we can't forget
    if (usage.inputTokens === undefined) {
      return request.messages;
    }

    const completionTokens = request.maxTokens ?? ctx.defaultCompletionTokens ?? 4096; // Default completion buffer
    const availablePromptTokens = usage.inputTokens - completionTokens;
    const contextTokens = ctx.messages?.reduce((sum, msg) => sum + (msg.tokens || 0), 0) || 0;
    const removeTokens = contextTokens - availablePromptTokens;

    // ctx.messages structure: system -> (user -> assistant)[] -> user -> tool[]

    if (!ctx.messages || availablePromptTokens <= 0 || removeTokens <= 0) {
      return request.messages;
    }

    // If we have a token estimator, use it to fill in missing token counts
    if (ctx.estimateTokens) {
      for (const msg of ctx.messages) {
        if (msg.tokens === undefined) {
          msg.tokens = ctx.estimateTokens(msg);
        }
      }
    }
    
    // Chunk messages based on token boundaries in context
    let contextIndex = ctx.messages.length - 1;
    const chunks: Message[][] = [];
    const chunkTokens: number[] = [];
    let currentChunk: Message[] = [];

    for (let i = request.messages.length - 1; i >= 0; i--) {
      const msg = request.messages[i];
      currentChunk.push(msg);
      const ctxMsg = ctx.messages[contextIndex];
      if (ctxMsg.tokens && contextIndex > 0) {
        contextIndex--;
        chunks.unshift(currentChunk);
        chunkTokens.unshift(ctxMsg.tokens);
        currentChunk = [];
      }
    }
    if (currentChunk.length) {
      if (chunks.length === 0) {
        chunks.push(currentChunk);
        chunkTokens.push(availablePromptTokens);
      } else {
        chunks[0].unshift(...currentChunk);
      }
    }

    // Distribute tokens across messages in each chunk
    const messageTokens = chunks.map((c, i) => c.map(() => chunkTokens[i] / c.length)).flat();

    // Calculate where to start trimming and where to stop
    const messageMinIndex = request.messages.findIndex(m => m.role === 'system') + 1; // inclusive
    let messageMaxIndex = request.messages.findLastIndex(m => m.role === 'user'); // exclusive
    if (messageMaxIndex === -1) {
      messageMaxIndex = request.messages.length;
    }

    const trimmedMessages = request.messages.slice(0, messageMinIndex);
    let removesRemaining = removeTokens;
    let messageIndex = messageMinIndex;
    while (removesRemaining > 0 && messageIndex < messageMaxIndex) {
      const message = request.messages[messageIndex];
      if (message.role === 'system') {
        trimmedMessages.push(message);
      } else {
        removesRemaining -= messageTokens[messageIndex] || 0;
        messageIndex++;
      }
    }

    trimmedMessages.push(...request.messages.slice(messageIndex));

    return trimmedMessages;
  }
}

type ToolStatus = 'ready' | 'parsed' | 'invalid' | 'executing' | 'success' | 'error';

type ToolExecution<T> = {
  toolCall: ToolCall;
  tool?: T;
  definition?: ToolDefinition;
  status: ToolStatus;
  emitStart(): boolean;
  emitOutput(): boolean;
  emitError(): boolean;
  parse: () => Promise<ToolExecution<T>>;
  run: () => Promise<ToolExecution<T>>;
  args?: any;
  result?: string;
  error?: string;
}

function once<R>(fn: () => Promise<R>): () => Promise<R> {
  let promise: Promise<R>;
  return () => {
    if (!promise) {
      promise = fn();
    }
    return promise;
  };
}

function emitter() {
  const emitter = {
    called: false,
    ready: false,
    emit: () => {
      const emit = emitter.ready && !emitter.called;
      if (emit) {
        emitter.called = true;
      }
      return emit;
    },
  };
  return emitter;
}

function newToolExecution<T extends AnyTool>(ctx: Context<any, any>, toolCall: ToolCall, toolInfo?: { tool: T, definition: ToolDefinition }) {
  const start = emitter();
  const output = emitter();
  const error = emitter();

  const execution: ToolExecution<T> = {
    toolCall: toolCall,
    tool: toolInfo?.tool,
    definition: toolInfo?.definition,
    status: toolInfo ? 'ready' : 'error',
    error: toolInfo ? undefined : `Tool not found: ${toolCall.name}`,
    emitStart: start.emit,
    emitOutput: output.emit,
    emitError: error.emit,
    parse: once(async () => {
      // Already ran or failed earlier?
      if (execution.status !== 'ready') {
        return execution;
      }
      try {
        execution.args = await toolInfo!.tool.parse(ctx, toolCall.arguments, toolInfo!.definition.parameters);
        execution.status = 'parsed';
        start.ready = true;
      } catch (error: any) {
        execution.status = 'invalid';
        execution.error = `Error parsing tool arguments: ${error.message}`;
        error.ready = true;
      }

      return execution;
    }),
    run: once(async (): Promise<ToolExecution<T>> => {
      await execution.parse();
      if (execution.status !== 'parsed') {
        return execution;
      }
      try {
        execution.status = 'executing';
        execution.result = await resolve(toolInfo!.tool.run(ctx, execution.args));
        execution.status = 'success';
        output.ready = true;
      } catch (error: any) {
        execution.status = 'error';
        execution.error = `Error executing tool: ${error.message}`;
        error.ready = true;
      }

      return execution;
    }),
  };

  return execution;
};