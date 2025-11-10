import { Chunk, Instance, Model, ModelInput, Response, Runner, Usage, Events, ComponentOutput } from "./types";

/**
 * A flexible function type that can be:
 * - A direct value of type R
 * - A function that takes arguments A and returns R or Promise<R>
 * - A Promise that resolves to R
 */
export type Fn<R, A extends [any?, ...any[]] = []> = R | ((...args: A) => (R | Promise<R>)) | Promise<R>;

/**
 * Computes the resulting type R from a flexible function type Fn.
 */
export type FnResult<R> = R extends Promise<infer U> 
  ? U 
  : R extends (...args: any[]) => infer V
    ? V extends Promise<infer W>
      ? W
      : V
    : R;

/**
 * Retrieves the argument types A from a flexible function type Fn.
 */
export type FnArgs<F, Assumed = never> = F extends (...args: infer A) => any ? A : Assumed;

/**
 * Resolves a flexible function type into its standardized async function form.
 */
export type FnResolved<F extends Fn<any, any> | undefined> = 
  F extends undefined
    ? () => Promise<undefined>
    : F extends Fn<infer R, infer A>
      ? (...args: A) => Promise<R>
      : never
;

/**
 * Converts a flexible function type into a standardized async function.
 * Handles values, functions, and promises uniformly by wrapping them in async functions.
 *
 * @param fn - The flexible function type to convert.
 * @param reprocess - Optional function to transform the resolved value.
 * @returns An async function that takes the same arguments and returns a Promise of the resolved type.
 * @example
 * const fn1 = resolveFn(42); // () => Promise<42>
 * const fn2 = resolveFn(() => 'hello'); // () => Promise<'hello'>
 * const fn3 = resolveFn(Promise.resolve(10)); // () => Promise<10>
 */
export function resolveFn<R, A extends [any?, ...any[]] = []>(fn: undefined): ((...args: A) => Promise<undefined>)
export function resolveFn<R, A extends [any?, ...any[]] = []>(fn: Fn<R, A>): ((...args: A) => Promise<R>)
export function resolveFn<R, A extends [any?, ...any[]] = [], R2 = R>(fn: Fn<R, A>, reprocess: (r: R) => R2): ((...args: A) => Promise<R2>)
export function resolveFn<R, A extends [any?, ...any[]] = []>(fn?: Fn<R, A>, reprocess?: (r: R) => R): ((...args: A) => Promise<R | undefined>) {
  if (!fn) {
    return async () => undefined;
  }

  const isFunc = (x: any): x is ((...args: A) => (R | Promise<R>)) => typeof x === 'function';

  if (reprocess) {
    return fn instanceof Promise
      ? async () => reprocess(await fn)
      : isFunc(fn)
        ? async (...args: A) => reprocess(await fn(...args))
        : (() => {
            const cached = reprocess(fn);
            return async () => cached;
          })();
  } else {
    return fn instanceof Promise
      ? () => fn
      : isFunc(fn)
        ? async (...args: A) => await fn(...args)
        : async () => fn;
  }
}


/**
 * Checks if a promise has settled (either fulfilled or rejected).
 *
 * @param p - The promise to check.
 * @returns A promise that resolves to true if settled, false otherwise.
 */
export async function isSettled(p: Promise<any>): Promise<boolean> {
  return Promise.race([p.then(() => true), Promise.resolve(false)])
}

/**
 * Type guard to check if a value is a Promise.
 *
 * @param value - The value to check.
 * @returns True if the value is a Promise, false otherwise.
 */
export function isPromise<T = any>(value: any): value is Promise<T> {
  return value !== null && typeof value === 'object' && typeof value.then === 'function';
}

/**
 * Type guard to check if a value is an AsyncGenerator.
 *
 * @param value - The value to check.
 * @returns True if the value is an AsyncGenerator, false otherwise.
 */
export function isAsyncGenerator(value: any): value is AsyncGenerator<any, any, any> {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as any)[Symbol.asyncIterator] === "function" &&
    typeof (value as any).next === "function" &&
    typeof (value as any).throw === "function" &&
    typeof (value as any).return === "function"
  );
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
export async function* yieldAll<T>(
  promises: Promise<T>[]
): AsyncGenerator<{ result: Promise<T>, index: number }> {
  // Create index-tracking promises that resolve with their index
  const indexPromises = promises.map((p, i) =>
    // both fulfillment and rejection resolve to the index so the race
    // tells us when a promise *settles* (either way)
    p.then(() => i, () => i)
  );

  // Keep a Set of pending indices (stable ids that never shift)
  const pending = new Set<number>(promises.map((_, i) => i));

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
export async function resolve(input: any): Promise<any> {
  if (isPromise(input)) {
    return resolve(await input);
  } else if (isAsyncGenerator(input)) {
    let result = await input.next();
    while (!result.done) {
      result = await input.next();
    }
    return resolve(result.value);
  } else if (typeof input === 'function') {  
    return resolve(input());
  } else {
    return input;
  }
}

/**
 * Consumes all values from an AsyncGenerator and returns them as an array.
 * 
 * @param gen - The AsyncGenerator to consume.
 * @returns An array of all values yielded by the generator.
 */
export async function consumeAll<E>(gen: AsyncGenerator<E, any, any>): Promise<E[]> {
  const results: E[] = [];
  for await (const item of gen) {
    results.push(item);
  }
  return results;
}

/**
 * Resolves the type R from a value passed to `resolve`.
 */
export type Resolved<T> = T extends Promise<infer U> 
  ? U 
  : T extends AsyncGenerator<any, infer U, any> 
    ? U 
    : T;

/**
 * Accumulates usage statistics by adding values from one Usage object to another.
 * 
 * @param target - The target Usage object to accumulate into.
 * @param add - The Usage object to add from.
 * @returns 
 */
export function accumulateUsage(target: Usage, add?: Usage) {
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

/**
 * Gets a Model object from either a string ID or a ModelInput object.
 * 
 * @param input - The model identifier or ModelInput object.
 * @returns 
 */
export function getModel(input: ModelInput): Model;
export function getModel(input: ModelInput | undefined): Model | undefined;
export function getModel(input: ModelInput | undefined): Model | undefined {
  return typeof input === 'string' ? { id: input } : input;
}

/**
 * Converts a series of chunks into a Response object.
 * 
 * @param chunks - The array of Chunk objects to convert.
 * @returns The aggregated Response object.
 */
export function getResponseFromChunks(chunks: Chunk[]): Response {
  const resp: Response = { 
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
export function getChunksFromResponse(response: Response): Chunk[] {
  const chunks: Chunk[] = [];

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
    const markCompleted = (result: any) => {
      instance.status = 'completed';
      instance.completed = Date.now();
      instance.output = result;
      // @ts-ignore
      events.onStatus?.(instance);
    };

    // Helper to update instance status on error
    const markFailed = (error: any) => {
      if (instanceContext.signal?.aborted) {
        instance.status = 'interrupted';
      } else {
        instance.status = 'failed';
      }
      instance.completed = Date.now();
      instance.error = error;
      // @ts-ignore
      events.onStatus?.(instance);
    };

    // Helper to wrap an async generator with status tracking
    const wrapGenerator = async function*(generator: AsyncGenerator<any, any, any>) {
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
      } catch (error) {
        markFailed(error);
        throw error;
      }
    };

    // Handle async generators differently - wrap them instead of consuming
    if (isAsyncGenerator(output)) {
      return wrapGenerator(output as AsyncGenerator<any, any, any>) as ComponentOutput<C>;
    } else if (isPromise(output)) {
      // Check if the promise resolves to an async generator
      const wrappedGenerator = async function*() {
        try {
          const resolved = await output;

          if (isAsyncGenerator(resolved)) {
            // It's a Promise<AsyncGenerator>, wrap and forward
            return yield* wrapGenerator(resolved as AsyncGenerator<any, any, any>);
          } else {
            // It's a Promise<value>, just complete
            markCompleted(resolved);
            return resolved;
          }
        } catch (error) {
          markFailed(error);
          throw error;
        }
      }();

      return wrappedGenerator as ComponentOutput<C>;
    } else {
      // Original logic for non-generators, non-promises (raw values)
      const resolved = resolve(output);

      resolved.then(markCompleted, markFailed);

      return output;
    }
  };

  return runner;
}