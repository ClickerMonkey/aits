import z from 'zod';
import { Fn, Resolved } from "./common";
import { AnyTool, Tool, ToolCompatible } from "./tool";
import { Component, Context, Events, Names, OptionalParams, Request, Tuple, Usage } from "./types";
/**
 * Input provided to the prompt reconfiguration function.
 *
 * This allows the prompt to adjust its configuration based on runtime statistics.
 */
export interface PromptReconfigInput {
    iteration: number;
    maxIterations: number;
    toolParseErrors: number;
    toolCallErrors: number;
    tools: string[];
    toolSuccesses: number;
    toolRetries: number;
    outputRetries: number;
    forgetRetries: number;
}
/**
 * Reconfiguration options for a prompt during execution.
 */
export interface PromptReconfig {
    config?: Partial<Request>;
    maxIterations?: number;
    toolRetries?: number;
    outputRetries?: number;
    forgetRetries?: number;
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
export interface PromptInput<TContext = {}, TMetadata = {}, TName extends string = string, TInput extends object = {}, TOutput extends object | string = string, TTools extends Tuple<ToolCompatible<TContext, TMetadata>> = []> {
    name: TName;
    description: string;
    content: string;
    input?: Fn<Record<string, any>, [TInput | undefined, Context<TContext, TMetadata>]>;
    schema?: Fn<z.ZodType<TOutput> | false, [TInput | undefined, Context<TContext, TMetadata>]>;
    config?: Fn<Partial<Request> | false, [TInput | undefined, Context<TContext, TMetadata>]>;
    reconfig?: (stats: PromptReconfigInput, ctx: Context<TContext, TMetadata>) => PromptReconfig | Promise<PromptReconfig>;
    tools?: TTools;
    toolExecution?: 'sequential' | 'parallel' | 'immediate';
    toolRetries?: number;
    outputRetries?: number;
    forgetRetries?: number;
    toolsOnly?: boolean;
    toolIterations?: number;
    toolsMax?: number;
    retool?: Fn<Names<TTools>[] | false, [TInput | undefined, Context<TContext, TMetadata>]>;
    metadata?: TMetadata;
    metadataFn?: (input: TInput, ctx: Context<TContext, TMetadata>) => TMetadata | Promise<TMetadata>;
    excludeMessages?: boolean;
    validate?: (output: TOutput, ctx: Context<TContext, TMetadata>) => void | Promise<void>;
    applicable?: (ctx: Context<TContext, TMetadata>) => boolean | Promise<boolean>;
    types?: {
        input?: TInput;
        output?: TOutput;
        context?: TContext;
        metadata?: TMetadata;
    };
}
/**
 * Converts TTools into:
 *
 * { tool: 'name1', result: Result1 } | { tool: 'name2', result: Result2 } | ...
 */
export type PromptToolOutput<TTools extends AnyTool[]> = TTools extends Array<infer TI> ? TI extends Tool<any, any, infer TName, any, infer TO, any> ? {
    tool: TName;
    result: Resolved<TO>;
} : never : never;
/**
 * Converts TTools into a union of their names:
 *
 * 'name1' | 'name2' | ...
 */
export type PromptToolNames<TTools extends AnyTool[]> = TTools extends Tool<any, any, infer TName, any, any, any>[] ? TName : never;
/**
 * Convers TTools (tuple [T1, T2, ...]) into a single tool type (union T1 | T2 | ...)
 */
export type PromptTools<TTools extends AnyTool[]> = TTools extends (infer TTool)[] ? TTool : never;
/**
 * Converts TTools into tool-related events:
 *
 * { type: 'toolStart', tool: TTool, args: any } |
 * { type: 'toolOutput', tool: TTool, args: any, result: TOutput } |
 * { type: 'toolError', tool: TTool, args: any, error: string }
 */
export type PromptToolEvents<TTools extends Tuple<AnyTool>> = TTools extends Array<infer TTool> ? TTool extends Tool<infer t0, infer t1, infer t2, infer t3, infer TOutput, infer t4> ? {
    type: 'toolStart';
    tool: TTool;
    args: any;
    request: Request;
} | {
    type: 'toolOutput';
    tool: TTool;
    args: any;
    result: Resolved<TOutput>;
    request: Request;
} | {
    type: 'toolError';
    tool: TTool;
    args: any;
    error: string;
    request: Request;
} : never : never;
/**
 * The events emitted during prompt execution/streaming.
 */
export type PromptEvent<TOutput, TTools extends Tuple<AnyTool>> = {
    type: 'textPartial';
    content: string;
    request: Request;
} | {
    type: 'text';
    content: string;
    request: Request;
} | {
    type: 'refusal';
    content: string;
    request: Request;
} | {
    type: 'reason';
    content: string;
    request: Request;
} | {
    type: 'reasonPartial';
    content: string;
    request: Request;
} | {
    type: 'toolParseName';
    tool: PromptTools<TTools>;
    request: Request;
} | {
    type: 'toolParseArguments';
    tool: PromptTools<TTools>;
    args: string;
    request: Request;
} | PromptToolEvents<TTools> | {
    type: 'textComplete';
    content: string;
    request: Request;
} | {
    type: 'complete';
    output: TOutput;
    request: Request;
} | {
    type: 'textReset';
    reason?: string;
    request: Request;
} | {
    type: 'requestTokens';
    tokens: number;
    request: Request;
} | {
    type: 'responseTokens';
    tokens: number;
    request: Request;
} | {
    type: 'usage';
    usage: Usage;
    request: Request;
};
/**
 * A type representing any prompt component.
 */
export type AnyPrompt = Prompt<any, any, any, any, any, any>;
/**
 * The different modes for retrieving prompt output from the convenience get() method.
 */
export type PromptGetType = 'result' | 'tools' | 'stream' | 'streamTools' | 'streamContent';
/**
 * The result type of the prompt get() method based on the selected mode.
 */
export type PromptGet<TGetType extends PromptGetType, TOutput, TTools extends Tuple<AnyTool>> = {
    result: Promise<TOutput | undefined>;
    tools: Promise<PromptToolOutput<TTools>[] | undefined>;
    stream: AsyncGenerator<PromptEvent<TOutput, TTools>, TOutput | undefined, unknown>;
    streamTools: AsyncGenerator<PromptToolOutput<TTools>, TOutput | undefined, unknown>;
    streamContent: AsyncGenerator<string, TOutput | undefined, unknown>;
}[TGetType];
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
export declare class Prompt<TContext = {}, TMetadata = {}, TName extends string = string, TInput extends object = {}, TOutput extends object | string = string, TTools extends Tuple<ToolCompatible<TContext, TMetadata>> = []> implements Component<TContext, TMetadata, TName, TInput, AsyncGenerator<PromptEvent<TOutput, TTools>, TOutput | undefined, unknown>, TTools> {
    input: PromptInput<TContext, TMetadata, TName, TInput, TOutput, TTools>;
    private retool;
    private schema;
    private config;
    private translate;
    private content;
    private metadata;
    /**
     * Compiles the prompt content template.
     * Automatically appends tool instructions section if tools are available.
     *
     * @param content - The prompt content template string.
     * @param hasTools - Whether tools are available.
     * @returns A compiled Handlebars template function.
     */
    static compileContent(content: string, hasTools: boolean): HandlebarsTemplateDelegate<any>;
    constructor(input: PromptInput<TContext, TMetadata, TName, TInput, TOutput, TTools>, retool?: (args_0: TInput | undefined, args_1: Context<TContext, TMetadata>) => Promise<false | Names<TTools>[] | undefined>, schema?: (args_0: TInput | undefined, args_1: Context<TContext, TMetadata>) => Promise<false | z.ZodType<TOutput, unknown, z.core.$ZodTypeInternals<TOutput, unknown>> | undefined>, config?: (args_0: TInput | undefined, args_1: Context<TContext, TMetadata>) => Promise<false | Partial<Request> | undefined>, translate?: (args_0: TInput | undefined, args_1: Context<TContext, TMetadata>) => Promise<Record<string, any> | undefined>, content?: HandlebarsTemplateDelegate<any>, metadata?: (input: TInput, ctx: Context<TContext, TMetadata>) => Promise<TMetadata | undefined>);
    get kind(): 'prompt';
    get name(): TName;
    get description(): string;
    get refs(): TTools;
    /**
     * Retrieves the prompt output in various modes.
     *
     * - `result`: Returns the final output only
     * - `tools`: Returns all tool outputs only
     * - `stream`: Streams all prompt events
     * - `streamTools`: Streams only tool output events
     * - `streamContent`: Streams only text content events
     *
     * @param mode - The mode of output to retrieve. Defaults to 'result'.
     * @param input - The input parameters for the prompt.
     * @param ctx - The context for the prompt's operation.
     * @returns The prompt output based on the specified mode.
     * @example
     * // Get final result
     * const result = await prompt.get();
     *
     * // Stream content
     * for await (const chunk of prompt.get('streamContent', { text: 'hello' })) {
     *   console.log(chunk);
     * }
     */
    get<TGetType extends PromptGetType, TRuntimeContext extends TContext, TRuntimeMetadata extends TMetadata, TCoreContext extends Context<TRuntimeContext, TRuntimeMetadata>>(mode?: TGetType, ...[inputMaybe, contextMaybe]: OptionalParams<[TInput, TCoreContext]>): PromptGet<TGetType, TOutput, TTools>;
    /**
     * Runs the prompt with the given context and input.
     *
     * @param ctx - The context for the prompt's operation.
     * @param input - The input parameters for the prompt.
     * @returns An async generator yielding prompt events and ultimately the final output.
     */
    run<TRuntimeContext extends TContext, TRuntimeMetadata extends TMetadata, TCoreContext extends Context<TRuntimeContext, TRuntimeMetadata>>(...[inputMaybe, contextMaybe]: OptionalParams<[TInput, TCoreContext]>): AsyncGenerator<PromptEvent<TOutput, TTools>, TOutput | undefined, unknown>;
    /**
     * Determines if the prompt is applicable in the given context.
     * By default, checks retool, schema, and config functions if provided.
     *
     * @param ctx - The context to check applicability against.
     * @returns Whether the prompt is applicable.
     */
    applicable<TRuntimeContext extends TContext, TRuntimeMetadata extends TMetadata, TCoreContext extends Context<TRuntimeContext, TRuntimeMetadata>>(...[contextMaybe]: OptionalParams<[TCoreContext]>): Promise<boolean>;
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
    stream<TRuntimeContext extends TContext, TRuntimeMetadata extends TMetadata, TCoreContext extends Context<TRuntimeContext, TRuntimeMetadata>>(...[inputMaybe, preferStream, toolsOnly, eventsMaybe, contextMaybe]: OptionalParams<[
        TInput,
        boolean,
        boolean,
        Events<Component<TRuntimeContext, TRuntimeMetadata, TName, TInput, AsyncGenerator<PromptEvent<TOutput, TTools>, TOutput | undefined, unknown>, TTools>> | undefined,
        TCoreContext
    ]>): AsyncGenerator<PromptEvent<TOutput, TTools>, TOutput | undefined, unknown>;
    /**
     * Prepares the prompt for execution by resolving all configuration, tools, and templates.
     * Returns undefined if the prompt is not compatible with the given context.
     *
     * @param ctx - The context to prepare against.
     * @param input - The input to the prompt.
     * @returns The resolved prompt components or undefined if not compatible.
     */
    private resolve;
    /**
     * Converts a non-streaming executor into a streamer by yielding response parts.
     * This allows uniform handling of streaming and non-streaming AI providers.
     *
     * @param execute - The executor function to convert.
     * @returns A streamer function that yields parts of the executor's response.
     */
    private streamify;
    /**
     * Trims messages from the request to fit within token limits.
     *
     * This is called:
     * - Before a request is made to ensure the prompt fits within the model's context window if it's specified
     * - After a response with a 'length' finish reason to allow retrying with trimmed context
     * - After a provider catches an early context window error and emits amn artificial length event.
     *
     * Scenarios that support trimming:
     * 1. Token usage is provided from a previous request (we can use this to infer token counts)
     * 2. A token estimation function is provided in the context (we can estimate token counts)
     * 3. Messages already have token counts assigned (we can use these directly)
     *
     * @param request - The original request with messages.
     * @param ctx - The context containing message history and token estimation.
     * @param usage - The current token usage.
     * @returns The trimmed array of messages.
     */
    private forget;
}
//# sourceMappingURL=prompt.d.ts.map