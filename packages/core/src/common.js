export function resolveFn(fn, reprocess) {
    if (!fn) {
        return async () => undefined;
    }
    const isFunc = (x) => typeof x === 'function';
    if (reprocess) {
        return fn instanceof Promise
            ? async () => reprocess(await fn)
            : isFunc(fn)
                ? async (...args) => reprocess(await fn(...args))
                : (() => {
                    const cached = reprocess(fn);
                    return async () => cached;
                })();
    }
    else {
        return fn instanceof Promise
            ? () => fn
            : isFunc(fn)
                ? async (...args) => await fn(...args)
                : async () => fn;
    }
}
/**
 * Checks if a promise has settled (either fulfilled or rejected).
 *
 * @param p - The promise to check.
 * @returns A promise that resolves to true if settled, false otherwise.
 */
export async function isSettled(p) {
    return Promise.race([p.then(() => true), Promise.resolve(false)]);
}
/**
 * Type guard to check if a value is a Promise.
 *
 * @param value - The value to check.
 * @returns True if the value is a Promise, false otherwise.
 */
export function isPromise(value) {
    return value !== null && typeof value === 'object' && typeof value.then === 'function';
}
/**
 * Type guard to check if a value is an AsyncGenerator.
 *
 * @param value - The value to check.
 * @returns True if the value is an AsyncGenerator, false otherwise.
 */
export function isAsyncGenerator(value) {
    return (value != null &&
        typeof value === "object" &&
        typeof value[Symbol.asyncIterator] === "function" &&
        typeof value.next === "function" &&
        typeof value.throw === "function" &&
        typeof value.return === "function");
}
/**
 * Yields promises as they settle (either fulfill or reject), maintaining their original indices.
 * Useful for processing multiple async operations as soon as each one completes.
 *
 * @param promises - Array of promises to yield as they settle.
 * @returns An async generator yielding objects with the settled promise and its index.
 * @example
 * const promises = [delay(100), delay(50), delay(200)];
 * for await (const { result, index } of yieldAll(promises)) {
 *   console.log(`Promise ${index} settled`);
 *   const value = await result;
 * }
 */
export async function* yieldAll(promises) {
    // Create index-tracking promises that resolve with their index
    const indexPromises = promises.map((p, i) => 
    // both fulfillment and rejection resolve to the index so the race
    // tells us when a promise *settles* (either way)
    p.then(() => i, () => i));
    // Keep a Set of pending indices (stable ids that never shift)
    const pending = new Set(promises.map((_, i) => i));
    while (pending.size > 0) {
        // Race only the still-pending index-promises
        const racers = Array.from(pending).map(i => indexPromises[i]);
        const idx = await Promise.race(racers);
        // Yield the original Promise<T> so the caller decides how to await/handle it
        yield { result: promises[idx], index: idx };
        // Remove by stable index (no shifting problems)
        pending.delete(idx);
    }
}
/**
 * Resolves an output value from various input types.
 * Handles promises, raw values, and AsyncGenerators uniformly.
 * These are all common return types of AI components.
 *
 * @param input - The value to resolve (can be a value, Promise, or AsyncGenerator).
 * @returns A promise that resolves to the final value.
 * @example
 * await resolve(42); // 42
 * await resolve(Promise.resolve('hello')); // 'hello'
 * await resolve(asyncGenerator()); // final return value
 */
export async function resolve(input) {
    if (isPromise(input)) {
        return resolve(await input);
    }
    else if (isAsyncGenerator(input)) {
        let result = await input.next();
        while (!result.done) {
            result = await input.next();
        }
        return resolve(result.value);
    }
    else if (typeof input === 'function') {
        return resolve(input());
    }
    else {
        return input;
    }
}
/**
 * Consumes all values from an AsyncGenerator and returns them as an array.
 *
 * @param gen - The AsyncGenerator to consume.
 * @returns An array of all values yielded by the generator.
 */
export async function consumeAll(gen) {
    const results = [];
    for await (const item of gen) {
        results.push(item);
    }
    return results;
}
/**
 * Accumulates usage statistics by adding values from one Usage object to another.
 *
 * @param target - The target Usage object to accumulate into.
 * @param add - The Usage object to add from.
 * @returns
 */
export function accumulateUsage(target, add) {
    if (!add) {
        return;
    }
    target.cachedTokens = add.cachedTokens
        ? (target.cachedTokens || 0) + add.cachedTokens
        : target.cachedTokens;
    target.cost = add.cost
        ? (target.cost || 0) + add.cost
        : target.cost;
    target.inputTokens = add.inputTokens
        ? (target.inputTokens || 0) + add.inputTokens
        : target.inputTokens;
    target.outputTokens = add.outputTokens
        ? (target.outputTokens || 0) + add.outputTokens
        : target.outputTokens;
    target.reasoningTokens = add.reasoningTokens
        ? (target.reasoningTokens || 0) + add.reasoningTokens
        : target.reasoningTokens;
    target.totalTokens = add.totalTokens
        ? (target.totalTokens || 0) + add.totalTokens
        : target.totalTokens;
    target.seconds = add.seconds
        ? (target.seconds || 0) + add.seconds
        : target.seconds;
}
export function getModel(input) {
    return typeof input === 'string' ? { id: input } : input;
}
/**
 * Converts a series of chunks into a Response object.
 *
 * @param chunks - The array of Chunk objects to convert.
 * @returns The aggregated Response object.
 */
export function getResponseFromChunks(chunks) {
    const resp = {
        content: '',
        finishReason: 'stop',
        model: 'unknown',
    };
    for (const chunk of chunks) {
        if (chunk.content) {
            resp.content += chunk.content;
        }
        if (chunk.finishReason) {
            resp.finishReason = chunk.finishReason;
        }
        if (chunk.reasoning) {
            resp.reasoning = (resp.reasoning || '') + chunk.reasoning;
        }
        if (chunk.model) {
            resp.model = chunk.model;
        }
        if (chunk.refusal) {
            resp.refusal = chunk.refusal;
        }
        if (chunk.toolCall) {
            resp.toolCalls = resp.toolCalls || [];
            resp.toolCalls.push(chunk.toolCall);
        }
        if (chunk.usage) {
            resp.usage = resp.usage || {};
            accumulateUsage(resp.usage, chunk.usage);
        }
    }
    return resp;
}
/**
 * Converts a Response object into an array of Chunk objects.
 *
 * @param response - The response to convert.
 * @returns The built chunks from the response.
 */
export function getChunksFromResponse(response) {
    const chunks = [];
    if (response.reasoning || response.refusal) {
        chunks.push({
            refusal: response.refusal,
            reasoning: response.reasoning,
        });
    }
    for (const toolCall of response.toolCalls || []) {
        chunks.push({ toolCall, toolCallNamed: toolCall, toolCallArguments: toolCall });
    }
    chunks.push({
        content: response.content,
        finishReason: response.finishReason,
        usage: response.usage,
        model: response.model,
    });
    return chunks;
}
/**
 * Creates a runner that emits events during component execution.
 *
 * @param events
 * @returns
 */ // @ts-ignore
export function withEvents(events) {
    let instanceIndex = 0;
    const runner = (component, input, context, getOutput) => {
        const instanceContext = { ...context };
        const instance = {
            id: `${component.kind}:${component.name}:${instanceIndex++}`,
            parent: context.instance,
            component,
            context: instanceContext,
            input,
            status: 'pending',
        };
        if (instanceContext.instance) {
            instanceContext.instance.children = instanceContext.instance.children || [];
            instanceContext.instance.children.push(instance);
        }
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
        // Helper to update instance status on completion
        const markCompleted = (result) => {
            instance.status = 'completed';
            instance.completed = Date.now();
            instance.output = result;
            // @ts-ignore
            events.onStatus?.(instance);
        };
        // Helper to update instance status on error
        const markFailed = (error) => {
            if (instanceContext.signal?.aborted) {
                instance.status = 'interrupted';
            }
            else {
                instance.status = 'failed';
            }
            instance.completed = Date.now();
            instance.error = error;
            // @ts-ignore
            events.onStatus?.(instance);
        };
        // Helper to wrap an async generator with status tracking
        const wrapGenerator = async function* (generator) {
            try {
                // Yield all events from the original generator
                for await (const event of generator) {
                    yield event;
                }
                // Capture the return value (generator is now exhausted)
                const lastResult = await generator.next();
                const finalResult = lastResult.value;
                markCompleted(finalResult);
                return finalResult;
            }
            catch (error) {
                markFailed(error);
                throw error;
            }
        };
        // Handle async generators differently - wrap them instead of consuming
        if (isAsyncGenerator(output)) {
            return wrapGenerator(output);
        }
        else if (isPromise(output)) {
            // Check if the promise resolves to an async generator
            const wrappedGenerator = async function* () {
                try {
                    const resolved = await output;
                    if (isAsyncGenerator(resolved)) {
                        // It's a Promise<AsyncGenerator>, wrap and forward
                        return yield* wrapGenerator(resolved);
                    }
                    else {
                        // It's a Promise<value>, just complete
                        markCompleted(resolved);
                        return resolved;
                    }
                }
                catch (error) {
                    markFailed(error);
                    throw error;
                }
            }();
            return wrappedGenerator;
        }
        else {
            // Original logic for non-generators, non-promises (raw values)
            const resolved = resolve(output);
            resolved.then(markCompleted, markFailed);
            return output;
        }
    };
    return runner;
}
//# sourceMappingURL=common.js.map