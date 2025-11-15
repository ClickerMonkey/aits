import Handlebars from "handlebars";
import z from 'zod';
import { accumulateUsage, getChunksFromResponse, getModel, resolve, resolveFn, yieldAll } from "./common";
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
export class Prompt {
    input;
    retool;
    schema;
    config;
    translate;
    content;
    metadata;
    /**
     * Compiles the prompt content template.
     * Automatically appends tool instructions section if tools are available.
     *
     * @param content - The prompt content template string.
     * @param hasTools - Whether tools are available.
     * @returns A compiled Handlebars template function.
     */
    static compileContent(content, hasTools) {
        let template = content;
        if (hasTools && !template.includes('{{tools}}')) {
            template = template + "\n\n<tools>\n{{tools}}\n</tools>";
        }
        return Handlebars.compile(template);
    }
    constructor(input, retool = resolveFn(input.retool), schema = resolveFn(input.schema), config = resolveFn(input.config), translate = resolveFn(input.input), content = Prompt.compileContent(input.content, !!input.tools?.length), metadata = resolveFn(input.metadataFn)) {
        this.input = input;
        this.retool = retool;
        this.schema = schema;
        this.config = config;
        this.translate = translate;
        this.content = content;
        this.metadata = metadata;
    }
    get kind() {
        return 'prompt';
    }
    get name() {
        return this.input.name;
    }
    get description() {
        return this.input.description;
    }
    get refs() {
        return this.input.tools || [];
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
    get(mode = 'result', ...[inputMaybe, contextMaybe]) {
        const prompt = this;
        const input = (inputMaybe || {});
        const ctx = (contextMaybe || {});
        const preferStream = mode.startsWith('stream');
        const toolsOnly = mode === 'tools';
        const stream = ctx.runner
            // @ts-ignore
            ? ctx.runner(prompt, input, ctx, (innerCtx, events) => this.stream(input, preferStream, toolsOnly, events, innerCtx))
            : this.stream(input, preferStream, toolsOnly, undefined, ctx);
        switch (mode) {
            case 'result':
                return (async function () {
                    for await (const event of stream) {
                        if (event.type === 'complete') {
                            return event.output;
                        }
                    }
                })();
            case 'tools':
                return (async function () {
                    const tools = [];
                    for await (const event of stream) {
                        if (event.type === 'toolOutput') {
                            tools.push({ tool: event.tool.name, result: event.result });
                        }
                    }
                    return tools;
                })();
            case 'stream':
                return (async function* () {
                    let output = undefined;
                    for await (const event of stream) {
                        yield event;
                        if (event.type === 'complete') {
                            output = event.output;
                        }
                    }
                    return output;
                })();
            case 'streamTools':
                return (async function* () {
                    let output = undefined;
                    for await (const event of stream) {
                        if (event.type === 'toolOutput') {
                            yield { tool: event.tool.name, result: event.result };
                        }
                        if (event.type === 'complete') {
                            output = event.output;
                        }
                    }
                    return output;
                })();
            case 'streamContent':
                return (async function* () {
                    let output = undefined;
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
    run(...[inputMaybe, contextMaybe]) {
        const input = (inputMaybe || {});
        const ctx = (contextMaybe || {});
        const prompt = this;
        return ctx.runner
            // @ts-ignore
            ? ctx.runner(prompt, input, ctx, (innerCtx, events) => this.stream(input, true, false, events, innerCtx))
            : this.stream(input, true, false, undefined, ctx);
    }
    /**
     * Determines if the prompt is applicable in the given context.
     * By default, checks retool, schema, and config functions if provided.
     *
     * @param ctx - The context to check applicability against.
     * @returns Whether the prompt is applicable.
     */
    async applicable(...[contextMaybe]) {
        const ctx = (contextMaybe || {});
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
    async *stream(...[inputMaybe, preferStream = true, toolsOnly = false, eventsMaybe, contextMaybe]) {
        const input = (inputMaybe || {});
        const events = (eventsMaybe || {});
        const ctx = (contextMaybe || {});
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
        const toolMap = new Map(toolObjects?.map(({ tool, definition }) => [tool.name, { tool, definition }]) || []);
        const onlyTools = toolsOnly || this.input.toolsOnly;
        const request = {
            name: this.name,
            ...config,
            maxTokens: config?.maxTokens ?? ctx.maxOutputTokens,
            messages: [
                { role: 'system', content },
            ],
            tools,
            responseFormat,
        };
        const fixedToolChoice = request.toolChoice && (request.toolChoice === 'required' || typeof request.toolChoice === 'object');
        if (fixedToolChoice && (!tools || tools.length === 0)) {
            throw new Error(`Prompt ${this.input.name} is configured to require tools, but no tools are available.`);
        }
        if (!this.input.excludeMessages && ctx.messages) {
            request.messages = request.messages.concat(ctx.messages);
            // Pre-emptively trim context messages if we have a context window limit
            request.messages = this.forget(request, ctx);
        }
        let outputRetries = this.input.outputRetries ?? ctx.outputRetries ?? 2;
        let forgetRetries = this.input.forgetRetries ?? ctx.forgetRetries ?? 1;
        let toolIterations = this.input.toolIterations ?? 3;
        let toolRetries = this.input.toolRetries ?? ctx.toolRetries ?? 2;
        let result = undefined;
        let lastError = undefined;
        let completeText = '';
        let maxIterations = outputRetries + forgetRetries + toolIterations + toolRetries + 1;
        let requestTokensSent = false;
        let usage = undefined;
        let iterations = 0;
        let accumulatedUsage = {};
        // Track stats for reconfig
        let toolParseErrors = 0;
        let toolCallErrors = 0;
        let toolSuccesses = 0;
        const toolsCalled = new Set();
        // Emit is a helper to optionally emit events and return the value passed in so it can be yielded.
        const emit = events?.onPromptEvent && ctx.instance
            ? (ev) => {
                // @ts-ignore
                events.onPromptEvent(ctx.instance, ev);
                return ev;
            }
            : (ev) => ev;
        const emitTool = (ev) => emit(ev);
        // Main execution loop!
        while (iterations < maxIterations) {
            const toolCalls = [];
            const toolCallMap = new Map();
            const toolErrorsPrevious = (toolCallErrors + toolParseErrors);
            const toolParseErrorsPrevious = toolParseErrors;
            let finishReason = undefined;
            let refusal = '';
            let reasoning = '';
            let content = '';
            let disableTools = false;
            const streamController = new AbortController();
            const streamAbort = () => streamController.abort();
            ctx.signal?.addEventListener('abort', streamAbort);
            const metadata = {
                ...(this.input.metadata || {}),
                ...(await this.metadata(input, ctx) || {}),
            };
            const stream = streamer(request, ctx, metadata, streamController.signal);
            for await (const chunk of stream) {
                if (streamController.signal.aborted) {
                    break;
                }
                if (chunk.usage) {
                    usage = chunk.usage;
                    if (!requestTokensSent) {
                        yield emit({ type: 'requestTokens', tokens: chunk.usage.inputTokens ?? 0, request });
                        requestTokensSent = true;
                    }
                    accumulateUsage(accumulatedUsage, chunk.usage);
                }
                if (chunk.content) {
                    content += chunk.content;
                    yield emit({ type: 'textPartial', content: chunk.content, request });
                }
                if (chunk.refusal) {
                    refusal += chunk.refusal;
                    yield emit({ type: 'textPartial', content: chunk.refusal, request });
                }
                if (chunk.reasoning) {
                    reasoning += chunk.reasoning;
                    yield emit({ type: 'reasonPartial', content: chunk.reasoning, request });
                }
                // Handle tool calls
                if (chunk.toolCallNamed) {
                    const toolCall = newToolExecution(ctx, chunk.toolCallNamed, toolMap.get(chunk.toolCallNamed.name));
                    toolCalls.push(toolCall);
                    toolCallMap.set(chunk.toolCallNamed.id, toolCall);
                    if (toolCall.tool) {
                        yield emit({ type: 'toolParseName', tool: toolCall.tool, request });
                    }
                    else {
                        streamController.abort(toolCall.error);
                        break;
                    }
                }
                if (chunk.toolCallArguments) {
                    const toolCall = toolCallMap.get(chunk.toolCallArguments.id);
                    toolCall.toolCall = chunk.toolCallArguments;
                    yield emit({ type: 'toolParseArguments', tool: toolCall.tool, args: chunk.toolCallArguments.arguments, request });
                }
                if (chunk.toolCall) {
                    const toolCall = toolCallMap.get(chunk.toolCall.id);
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
                            yield emitTool({ type: 'toolStart', tool: toolCall.tool, args: toolCall.args, request });
                        }
                        if (toolCall.emitOutput()) {
                            yield emitTool({ type: 'toolOutput', tool: toolCall.tool, args: toolCall.args, result: toolCall.result, request });
                        }
                        if (toolCall.emitError()) {
                            yield emitTool({ type: 'toolError', tool: toolCall.tool, args: toolCall.args, error: toolCall.error, request });
                        }
                    }
                }
            }
            ctx.signal?.removeEventListener('abort', streamAbort);
            // If the model reasoned, yield it
            if (reasoning) {
                yield emit({ type: 'reason', content: reasoning, request });
            }
            // If the model refused to answer and stop
            if (finishReason === 'refusal' || refusal) {
                yield emit({ type: 'refusal', content: refusal || 'unspecified', request });
                lastError = refusal || 'Model refused to answer.';
                break;
            }
            // If the model was stopped due to content filtering
            if (finishReason === 'content_filter') {
                yield emit({ type: 'refusal', content: 'Content filtered by AI model', request });
                lastError = 'Model response was filtered due to content policy.';
                break;
            }
            // If we sent too much, forget the past homie 
            if (finishReason === 'length') {
                if (usage && forgetRetries > 0) {
                    request.messages = this.forget(request, ctx, usage);
                    forgetRetries--;
                    yield emit({ type: 'textReset', reason: 'length', request });
                    // Lets retry immediately
                    continue;
                }
                else {
                    // Stop iteration - we can't trim without usage info
                    lastError = 'Model indicated length finish reason but no token usage was provided so context cannot be trimmed.';
                    break;
                }
            }
            // Yield text event if content exists before processing tool calls
            if (content.length > 0) {
                yield emit({ type: 'text', content, request });
            }
            // If we need to make some tool calls, lets do it! 
            // We might not have a finish_reason if we got a bad tool name.
            if (finishReason === 'tool_calls' || toolCalls.length) {
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
                    }
                    else {
                        // Non-blocking call, we don't want to hold up execution here. But if we can emit start or error early below this we will try.
                        toolCall.parse();
                    }
                    if (toolCall.emitStart()) {
                        yield emitTool({ type: 'toolStart', tool: toolCall.tool, args: toolCall.args, request });
                    }
                    if (toolCall.emitError()) {
                        yield emitTool({ type: 'toolError', tool: toolCall.tool, args: toolCall.args, error: toolCall.error, request });
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
                                yield emitTool({ type: 'toolStart', tool: toolCall.tool, args: toolCall.args, request });
                            }
                            await toolCall.run();
                            if (toolCall.emitOutput()) {
                                yield emitTool({ type: 'toolOutput', tool: toolCall.tool, args: toolCall.args, result: toolCall.result, request });
                            }
                            if (toolCall.emitError()) {
                                yield emitTool({ type: 'toolError', tool: toolCall.tool, args: toolCall.args, error: toolCall.error, request });
                            }
                        }
                        break;
                    case 'parallel':
                    case 'immediate':
                        const parseRuns = toolCalls.map(tc => [tc.parse(), tc.run()]).flat();
                        for await (const { result: toolCallPromise } of yieldAll(parseRuns)) {
                            const toolCall = await toolCallPromise;
                            if (toolCall.emitStart()) {
                                yield emitTool({ type: 'toolStart', tool: toolCall.tool, args: toolCall.args, request });
                            }
                            if (toolCall.emitOutput()) {
                                yield emitTool({ type: 'toolOutput', tool: toolCall.tool, args: toolCall.args, result: toolCall.result, request });
                            }
                            if (toolCall.emitError()) {
                                yield emitTool({ type: 'toolError', tool: toolCall.tool, args: toolCall.args, error: toolCall.error, request });
                            }
                        }
                        break;
                }
                for (const toolCall of toolCalls) {
                    const content = toolCall.error
                        ? toolCall.error
                        : toolCall.result
                            ? typeof toolCall.result === 'string'
                                ? toolCall.result
                                : JSON.stringify(toolCall.result)
                            : '';
                    request.messages.push({
                        role: 'tool',
                        content,
                        toolCallId: toolCall.toolCall.id,
                    });
                    if (toolCall.status === 'invalid') {
                        toolParseErrors++;
                    }
                    else if (toolCall.status === 'error') {
                        toolCallErrors++;
                    }
                    else if (toolCall.status === 'success') {
                        toolSuccesses++;
                    }
                }
                if ((toolCallErrors + toolParseErrors) > toolErrorsPrevious) {
                    if (toolRetries > 0) {
                        toolRetries--;
                    }
                    else {
                        disableTools = true;
                    }
                }
            }
            const hadToolErrors = toolParseErrorsPrevious !== toolParseErrors;
            const hitMax = this.input.toolsMax && toolSuccesses >= this.input.toolsMax;
            // If if there are only tool calls wanted...
            if (onlyTools) {
                const successWithoutNewErrors = toolSuccesses > 0 && !hadToolErrors;
                const noTools = toolCalls.length === 0;
                // If we met our max tool calls, or had some successes with no new errors, or there are no more tools to call, end it.
                if (hitMax || successWithoutNewErrors || noTools) {
                    // got what we needed!
                    lastError = undefined;
                    break;
                }
            }
            else {
                // We don't only want tools, but if we had some successes and no new parse errors, remove tool requirement
                if (fixedToolChoice && toolSuccesses > 0 && !hadToolErrors) {
                    delete request.toolChoice;
                }
                // If we met our max tool calls, remove the tools from the request
                if (hitMax) {
                    // No more tools for you!
                    disableTools = true;
                }
            }
            // Accumulate text content from this iteration
            if (content.length > 0) {
                completeText += content;
            }
            // If we are finished, parse the output
            if (finishReason === 'stop') {
                if (!schema || (schema instanceof z.ZodString)) {
                    result = content;
                    break; // All good!
                }
                else {
                    // Grab the JSON part from the content just in case...
                    const potentialJSON = content.substring(content.indexOf('{'), content.lastIndexOf('}') + 1);
                    let errorMessage = '';
                    let resetReason = '';
                    try {
                        const parsedJSON = JSON.parse(potentialJSON);
                        const parsedSafe = schema.safeParse(parsedJSON);
                        if (!parsedSafe.success) {
                            const issueSummary = parsedSafe.error.issues
                                .map(i => `- ${i.path.join('.')}: ${i.message}${['string', 'boolean', 'number'].includes(typeof i.input) ? ` (input: ${i.input})` : ''}`)
                                .join('\n');
                            errorMessage = `The output was an invalid format:\n${issueSummary}\n\nPlease adhere to the output schema:\n${z.toJSONSchema(schema)}`;
                            resetReason = 'schema-parsing';
                        }
                        else {
                            result = parsedSafe.data;
                            try {
                                await this.input.validate?.(result, ctx);
                            }
                            catch (validationError) {
                                errorMessage = `The output failed validation:\n${validationError.message}`;
                                resetReason = 'validation';
                            }
                        }
                    }
                    catch (parseError) {
                        errorMessage = `The output was not valid JSON:\n${parseError.message}`;
                        resetReason = 'json-parsing';
                    }
                    if (errorMessage) {
                        if (outputRetries > 0) {
                            outputRetries--;
                            yield emit({ type: 'textReset', reason: resetReason, request });
                            request.messages.push({
                                role: 'user',
                                content: errorMessage,
                            });
                        }
                        else {
                            lastError = errorMessage;
                            break; // No more retries left
                        }
                    }
                    else {
                        // A result was successfully parsed and validated!
                        lastError = undefined;
                        break;
                    }
                }
            }
            // Call reconfig if provided
            if (this.input.reconfig) {
                const stats = {
                    iteration: iterations,
                    maxIterations,
                    toolParseErrors,
                    toolCallErrors,
                    toolSuccesses,
                    toolRetries,
                    outputRetries,
                    forgetRetries,
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
                        }
                        else if (reconfigResult.maxIterations > 0) {
                            maxIterations = iterations + reconfigResult.maxIterations;
                        }
                    }
                    if (reconfigResult.outputRetries !== undefined) {
                        outputRetries = reconfigResult.outputRetries;
                    }
                    if (reconfigResult.forgetRetries !== undefined) {
                        forgetRetries = reconfigResult.forgetRetries;
                    }
                    if (reconfigResult.toolRetries !== undefined) {
                        toolRetries = reconfigResult.toolRetries;
                        if (toolRetries === 0) {
                            disableTools = true;
                        }
                    }
                }
            }
            // If we disabled tools because of hitting retry limits or max tool calls desired, remove them!
            if (disableTools) {
                delete request.tools;
                delete request.toolChoice;
                delete request.toolsOneAtATime;
            }
            // Lets go again!
            // We are hungry for valid tool calls and output!
            iterations++;
        }
        yield emit({ type: 'textComplete', content: completeText, request });
        // Yield token usage if available
        if (usage?.outputTokens) {
            yield emit({ type: 'responseTokens', tokens: usage.outputTokens, request });
        }
        yield emit({ type: 'usage', usage: accumulatedUsage, request });
        // We don't emit complete without a valid result unless toolsOnly is set
        if (result === undefined && !onlyTools) {
            if (!lastError && iterations === maxIterations) {
                lastError = `Maximum iterations (${maxIterations}) reached without a valid response.`;
            }
            if (!lastError) {
                lastError = `Prompt ${this.input.name} failed without a specified error.`;
            }
            throw new Error(`Prompt ${this.input.name} failed: ${lastError}`);
        }
        yield emit({ type: 'complete', output: result, request });
        return result;
    }
    /**
     * Prepares the prompt for execution by resolving all configuration, tools, and templates.
     * Returns undefined if the prompt is not compatible with the given context.
     *
     * @param ctx - The context to prepare against.
     * @param input - The input to the prompt.
     * @returns The resolved prompt components or undefined if not compatible.
     */
    async resolve(ctx, input) {
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
            ? toolInstructions.map(t => t[0]).join("\n\n")
            : undefined;
        const tools = toolInstructions
            ? toolInstructions.map(t => t[1])
            : undefined;
        // Create toolObjects as array of { tool, definition } pairs
        const toolObjects = selectedTools && toolInstructions
            ? selectedTools.map((tool, i) => ({ tool, definition: toolInstructions[i][1] }))
            : [];
        // Compute the input that is fed to the prompt's prompt content
        let contentInput = input;
        const translated = await this.translate(input, ctx);
        if (translated) {
            contentInput = translated;
        }
        contentInput.tools = instructions;
        // Compute content using the compiled template
        const content = this.content(contentInput);
        // Determine response format
        const responseFormat = schema && !(schema instanceof z.ZodString)
            ? schema
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
    streamify(execute) {
        return async function* (request, ctx, metadata, signal) {
            const response = await execute(request, ctx, metadata, signal);
            for (const chunk of getChunksFromResponse(response)) {
                yield chunk;
            }
            return response;
        };
    }
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
    forget(request, ctx, usage) {
        const model = getModel(request.model);
        const contextWindow = model?.contextWindow ?? ctx.contextWindow ?? usage?.totalTokens;
        // We can't forget our past if we don't know the context window
        if (contextWindow === undefined) {
            return request.messages;
        }
        // Calculate max input tokens allowed
        const maxOutput = request.maxTokens ?? ctx.maxOutputTokens ?? 4096; // Default completion buffer
        const maxInput = contextWindow - maxOutput;
        // ctx.messages structure: system -> (user -> assistant)[] -> user? -> assistant.tool_calls ->  tool[]
        // If we have any tokens defined, spread them out
        // If we have no tokens defined & estimateTokens, estimate them
        // If we have no tokens defined & no estimateTokens but we have usage.inputTokens, spread them out
        // If we have no tokens defined & no estimateTokens & no usage.inputTokens, we can't trim
        let messageTokens = [];
        const totalMessageTokens = request.messages.reduce((sum, t) => sum + (t.tokens || 0), 0);
        if (totalMessageTokens > 0) {
            const chunks = [];
            const chunkTokens = [];
            let currentChunk = [];
            for (let i = request.messages.length - 1; i >= 0; i--) {
                const msg = request.messages[i];
                currentChunk.push(msg);
                if (msg.tokens) {
                    chunks.unshift(currentChunk);
                    chunkTokens.unshift(msg.tokens);
                    currentChunk = [];
                }
            }
            if (currentChunk.length) {
                chunks[0].unshift(...currentChunk);
            }
            // Distribute tokens across messages in each chunk
            // If we have usage.inputTokens, we add them to the last chunk (usage.inputTokens - totalMessageTokens)
            if (usage?.inputTokens) {
                const overage = totalMessageTokens - usage.inputTokens;
                if (overage > 0) {
                    chunkTokens[chunkTokens.length - 1] += overage;
                }
            }
            messageTokens = chunks.map((c, i) => c.map(() => chunkTokens[i] / c.length)).flat();
        }
        else if (ctx.estimateTokens) {
            for (const msg of request.messages) {
                msg.tokens = ctx.estimateTokens(msg);
            }
            messageTokens = request.messages.map(m => m.tokens);
        }
        else if (usage?.inputTokens) {
            const spreadTokens = usage.inputTokens;
            const perMessage = Math.floor(spreadTokens / request.messages.length);
            messageTokens = request.messages.map(() => perMessage);
        }
        else {
            // we have no way to know token counts, so we can't trim
            return request.messages;
        }
        const totalMessageTokensFinal = messageTokens.reduce((sum, t) => sum + t, 0);
        if (totalMessageTokensFinal <= maxInput) {
            // No trimming needed
            return request.messages;
        }
        const removeTokens = totalMessageTokensFinal - maxInput;
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
                messageIndex++;
            }
            else {
                removesRemaining -= messageTokens[messageIndex] || 0;
                messageIndex++;
            }
        }
        trimmedMessages.push(...request.messages.slice(messageIndex));
        return trimmedMessages;
    }
}
function once(fn) {
    let promise;
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
function newToolExecution(ctx, toolCall, toolInfo) {
    const start = emitter();
    const output = emitter();
    const error = emitter();
    if (!toolInfo) {
        error.ready = true;
    }
    const execution = {
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
                execution.args = await toolInfo.tool.parse(ctx, toolCall.arguments, toolInfo.definition.parameters);
                execution.status = 'parsed';
                start.ready = true;
            }
            catch (e) {
                execution.status = 'invalid';
                execution.error = `Error parsing tool arguments: ${e.message}, args: ${toolCall.arguments}`;
                error.ready = true;
            }
            return execution;
        }),
        run: once(async () => {
            await execution.parse();
            if (execution.status !== 'parsed') {
                return execution;
            }
            try {
                execution.status = 'executing';
                execution.result = await resolve(toolInfo.tool.run(execution.args, ctx));
                execution.status = 'success';
                output.ready = true;
            }
            catch (e) {
                execution.status = 'error';
                execution.error = `Error executing tool: ${e.message}, args: ${JSON.stringify(execution.args)}`;
                error.ready = true;
            }
            return execution;
        }),
    };
    return execution;
}
;
//# sourceMappingURL=prompt.js.map