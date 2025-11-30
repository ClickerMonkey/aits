import fs from 'fs';
import path from 'path';
import url from 'url'
import { Chunk, Instance, Model, ModelInput, Response, Runner, Usage, Events, ComponentOutput, Resource } from "./types";
import { Readable } from 'stream';
import { file, mime } from 'zod';
import { is } from 'zod/locales';

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
  ? Resolved<U>
  : T extends AsyncGenerator<any, infer U, any> 
    ? Resolved<U>
    : T
;

function hasUrl(x: any): x is { url(): string } {
  return x && typeof x.url === 'function';
}
function hasBlob(x: any): x is { blob(): Promise<Blob> | Blob } {
  return x && typeof x.blob === 'function';
}
function hasRead(x: any): x is { read(): Promise<ReadableStream> | ReadableStream } {
  return x && typeof x.read === 'function';
}
function isAsyncIterable(x: any): x is AsyncIterable<Uint8Array> {
  return x && typeof x[Symbol.asyncIterator] === 'function';
}

/**
 * Determines the ideal format of a given resource.
 * 
 * @param resource 
 * @returns 
 */
export function getResourceFormat(resource: Resource): 'url' | 'base64' | 'stream' {
  if (typeof resource === 'string') {
    if (resource.startsWith('data:')) {
      return 'base64';
    } else if (resource.startsWith('http://') || resource.startsWith('https://')) {
      return 'url';
    } else {
      return 'base64';
    }
  }
  if (hasUrl(resource) || resource instanceof URL) {
    return 'url';
  }
  return 'stream';
}

/**
 * Converts the input resource to a URL string.
 * 
 * For input string:
 * - If input is already a URL or string, it is returned as-is.
 * - If input is a data URL (e.g. base64), it is returned as-is.
 * - Otherwise it is base64-encoded and returned as a data URL.
 * 
 * For URL:
 * - It is returned with toString().
 * 
 * For Uint8Array/File/ReadStream/ReadableStream:
 * - It is base64-encoded and returned as a data URL.
 * 
 * @param input - The resource to convert.
 * @param mimeType - Optional MIME type for the data URL if one cannot be determined.
 * @param fallback - Optional fallback string to return if input type is invalid.
 * @returns http(s) URL or data URL string
 */
export async function toURL(
  input: Resource,
  mimeType?: string, 
  fallback?: string
): Promise<string> {
  if (input instanceof URL) {
    return input.toString();
  }
  if (typeof input === 'string' && (input.startsWith('data:') || input.startsWith('http://') || input.startsWith('https://'))) {
    return input;
  }
  if (hasUrl(input)) {
    return input.url();
  }

  return toBase64(input, mimeType, fallback);
}

/**
 * Converts the input resource to a Base64 data URL string.
 * This will represent the content of the resouce as a data URL.
 * 
 * @param input - The resource to convert.
 * @param mimeType - Optional MIME type for the data URL if one cannot be determined.
 * @param fallback - Optional fallback string to return if input type is invalid.
 * @returns - A promise that resolves to a Base64 data URL string.
 */
export async function toBase64(
  input: Resource, 
  mimeType?: string, 
  fallback?: string
): Promise<string> {
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      return input;
    }
    if (input.startsWith('http://') || input.startsWith('https://')) {
      input = new URL(input);
    } else if (input.startsWith('file://')) {
      const filePath = url.fileURLToPath(input);
      input = fs.createReadStream(filePath);
    } else {
      return `data:${mimeType || 'text/plain'};base64,${Buffer.from(input).toString('base64')}`;
    }
  }

  if (hasUrl(input)) {
    input = new URL(input.url());
  }
  if (input instanceof URL) {
    input = await (await fetch(input)).blob();
  }

  if (typeof input !== 'object') {
    if (fallback !== undefined) {
      return fallback;
    }

    throw new Error('Invalid input type');
  }

  if (hasBlob(input)) {
    input = await input.blob();
  }
  if (hasRead(input)) {
    input = await input.read();
  }
  if ('type' in input && typeof input.type === 'string' && input.type.length > 0) {
    mimeType = input.type;
  }
  if ('mimeType' in input && typeof input.mimeType === 'string' && input.mimeType.length > 0) {
    mimeType = input.mimeType;
  }
  if (input instanceof Blob) {
    input = await input.arrayBuffer();
  }
  if (input instanceof DataView) {
    input = Buffer.from(input.buffer);
  }
  if (input instanceof ArrayBuffer) {
    input = Buffer.from(input);
  }
  if (isAsyncIterable(input)) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of input) {
      chunks.push(chunk);
    }
    input = Buffer.concat(chunks);
  }
  
  const buffer = Buffer.isBuffer(input)
    ? input 
    : Buffer.from(input)
  const base64 = buffer.toString('base64');
  
  return `data:${mimeType || 'application/octet-stream'};base64,${base64}`;
}

/**
 * Converts the input resource to a text string. It assumes it points to resource
 * that is text or points to a text file.
 * 
 * @param input - The resource to convert.
 * @param fallback - Optional fallback string to return if conversion fails.
 * @returns - A promise that resolves to a text string.
 */
export async function toText(
  input: Resource,
  fallback: string = 'Unable to convert resource to text'
): Promise<string> {
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      const commaIndex = input.indexOf(',');
      if (commaIndex >= 0) {
        const base64Part = input.substring(commaIndex + 1);
        const buffer = Buffer.from(base64Part, 'base64');
        return buffer.toString('utf-8');
      }
    }
    return input;
  }
  const stream = await toStream(input);
  if (!stream) {
    return fallback;
  }
  const decoded = new TextDecoder();
  let text = '';
  for await (const chunk of stream) {
    text += decoded.decode(chunk);
  }
  return text;
}

/**
 * Converts the input resource to an AsyncIterable stream of Uint8Array chunks.
 * 
 * @param input - The resource to convert.
 * @returns A promise that resolves to an AsyncIterable of Uint8Array chunks, or null if conversion fails.
 */
export async function toStream(input: Resource, fallback?: Readable): Promise<Readable> {
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      const commaIndex = input.indexOf(',');
      if (commaIndex >= 0) {
        const base64Part = input.substring(commaIndex + 1);
        const buffer = Buffer.from(base64Part, 'base64');
        return Readable.from([buffer]);
      }
    }
    
    if (input.startsWith('http://') || input.startsWith('https://')) {
      input = new URL(input);
    } else if (input.startsWith('file://')) {
      const filePath = url.fileURLToPath(input);
      input = fs.createReadStream(filePath);
    } else {
      return Readable.from([Buffer.from(input, 'utf-8')]);
    }
  }  
  if (hasUrl(input)) {
    input = new URL(input.url());
  }
  if (input instanceof URL) {
    const response = await fetch(input);
    if (!response.ok) {
      if (fallback) {
        return fallback;
      }
      throw new Error(`Failed to fetch ${input}: ${response.status} ${response.statusText}`);
    }
    if (!response.body) {
      if (fallback) {
        return fallback;
      }
      throw new Error(`No response body from ${input}`);
    }
    return Readable.from(response.body);
  }
  if (hasRead(input)) {
    input = await input.read();
  }
  if (hasBlob(input)) {
    input = await input.blob();
  }
  if (input instanceof Blob) {
    input = input.stream();
  }
  if (input instanceof DataView) {
    input = Buffer.from(input.buffer);
  }
  if (input instanceof ArrayBuffer) {
    input = Buffer.from(input);
  }
  return Readable.from(input);
}

/**
 * Converts the input resource to a ReadableStream.
 * 
 * @param input - The resource to convert.
 * @param fallback - Optional fallback ReadableStream to use if conversion fails.
 * @returns A promise that resolves to a ReadableStream.
 */
export async function toReadableStream(input: Resource, fallback?: ReadableStream): Promise<ReadableStream> {
  return ReadableStream.from(await toStream(input, fallback ? Readable.fromWeb(fallback) : undefined));
}

/**
 * Converts the input resource to a File.
 * 
 * @param input - The resource to convert.
 * @returns A promise that resolves to an AsyncIterable of Uint8Array chunks, or null if conversion fails.
 */
export async function toFile(input: Resource, mimeType?: string, filename?: string): Promise<File> {
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      const [, type, base64Part] = input.substring(5).split(';base64,', 2);
      mimeType = type || mimeType;
      input = Buffer.from(base64Part, 'base64')
    } else if (input.startsWith('http://') || input.startsWith('https://')) {
      input = new URL(input);
    } else if (input.startsWith('file://')) {
      const filePath = url.fileURLToPath(input);
      input = await fs.openAsBlob(filePath);
      if (!filename) {
        filename = path.basename(filePath);
      }
      if (input.type && !mimeType) {
        mimeType = input.type;
      }
    } else {
      if (!mimeType) {
        mimeType = 'text/plain';
      }
      input = Buffer.from(input, 'utf-8');
    }
  }
  if (input instanceof File) {
    return input;
  }
  if (hasUrl(input)) {
    input = new URL(input.url());
  }
  if (input instanceof URL) {
    if (!filename) {
      filename = path.basename(input.pathname);
    }
    input = await fetch(input);
  }
  if (hasBlob(input)) {
    input = await input.blob();
  }
  if (hasRead(input)) {
    input = await input.read();
  }
  if (input instanceof ArrayBuffer) {
    input = new Blob([input]);
  }
  if (isAsyncIterable(input)) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of input) {
      chunks.push(chunk);
    }
    input = new Blob(chunks);
  }
  return new File([input], filename || 'file', {
    type: mimeType || 'application/octet-stream',
  });
}


/**
 * Accumulates usage statistics by adding values from one Usage object to another.
 * Handles the nested structure matching ModelPricing.
 * 
 * @param target - The target Usage object to accumulate into.
 * @param add - The Usage object to add from.
 * @returns 
 */
export function accumulateUsage(target: Usage, add?: Usage) {
  if (!add) {
    return;
  }

  // Accumulate text usage
  if (add.text) {
    if (!target.text) {
      target.text = {};
    }
    if (add.text.input !== undefined) {
      target.text.input = (target.text.input || 0) + add.text.input;
    }
    if (add.text.output !== undefined) {
      target.text.output = (target.text.output || 0) + add.text.output;
    }
    if (add.text.cached !== undefined) {
      target.text.cached = (target.text.cached || 0) + add.text.cached;
    }
  }

  // Accumulate audio usage
  if (add.audio) {
    if (!target.audio) {
      target.audio = {};
    }
    if (add.audio.input !== undefined) {
      target.audio.input = (target.audio.input || 0) + add.audio.input;
    }
    if (add.audio.output !== undefined) {
      target.audio.output = (target.audio.output || 0) + add.audio.output;
    }
    if (add.audio.seconds !== undefined) {
      target.audio.seconds = (target.audio.seconds || 0) + add.audio.seconds;
    }
  }

  // Accumulate image usage
  if (add.image) {
    if (!target.image) {
      target.image = { output: [] };
    }
    if (add.image.input !== undefined) {
      target.image.input = (target.image.input || 0) + add.image.input;
    }
    if (add.image.output) {
      if (!target.image.output) {
        target.image.output = [];
      }
      // Merge image outputs by quality and size
      for (const addOutput of add.image.output) {
        const existing = target.image.output.find(
          o => o.quality === addOutput.quality && 
               o.size.width === addOutput.size.width && 
               o.size.height === addOutput.size.height
        );
        if (existing) {
          existing.count += addOutput.count;
        } else {
          target.image.output.push({ ...addOutput });
        }
      }
    }
  }

  // Accumulate reasoning usage
  if (add.reasoning) {
    if (!target.reasoning) {
      target.reasoning = {};
    }
    if (add.reasoning.input !== undefined) {
      target.reasoning.input = (target.reasoning.input || 0) + add.reasoning.input;
    }
    if (add.reasoning.output !== undefined) {
      target.reasoning.output = (target.reasoning.output || 0) + add.reasoning.output;
    }
    if (add.reasoning.cached !== undefined) {
      target.reasoning.cached = (target.reasoning.cached || 0) + add.reasoning.cached;
    }
  }

  // Accumulate embeddings usage
  if (add.embeddings) {
    if (!target.embeddings) {
      target.embeddings = {};
    }
    if (add.embeddings.count !== undefined) {
      target.embeddings.count = (target.embeddings.count || 0) + add.embeddings.count;
    }
    if (add.embeddings.tokens !== undefined) {
      target.embeddings.tokens = (target.embeddings.tokens || 0) + add.embeddings.tokens;
    }
  }

  // Accumulate cost
  if (add.cost !== undefined) {
    target.cost = (target.cost || 0) + add.cost;
  }
}

/**
 * Calculate total input tokens from a Usage object.
 * Includes tokens from text, audio, image, reasoning input, and embeddings.
 * 
 * @param usage - The Usage object to calculate input tokens from
 * @returns Total input tokens
 */
export function getInputTokens(usage?: Usage): number {
  if (!usage) return 0;
  return (usage.text?.input || 0) + 
         (usage.audio?.input || 0) + 
         (usage.image?.input || 0) +
         (usage.reasoning?.input || 0) +
         (usage.embeddings?.tokens || 0);
}

/**
 * Calculate total output tokens from a Usage object.
 * Includes tokens from text, audio, and reasoning output.
 * Note: image.output represents generated images (not tokens), so it's excluded.
 * 
 * @param usage - The Usage object to calculate output tokens from
 * @returns Total output tokens
 */
export function getOutputTokens(usage?: Usage): number {
  if (!usage) return 0;
  return (usage.text?.output || 0) + 
         (usage.audio?.output || 0) + 
         (usage.reasoning?.output || 0);
}

/**
 * Calculate total tokens from a Usage object.
 * Includes all tokens: input, output, cached from all modalities.
 * Note: image.output represents generated images (not tokens), so it's excluded.
 * 
 * @param usage - The Usage object to calculate total tokens from
 * @returns Total tokens
 */
export function getTotalTokens(usage?: Usage): number {
  if (!usage) return 0;
  return (usage.text?.input || 0) + 
         (usage.text?.output || 0) + 
         (usage.text?.cached || 0) +
         (usage.audio?.input || 0) + 
         (usage.audio?.output || 0) +
         (usage.image?.input || 0) +
         (usage.reasoning?.input || 0) + 
         (usage.reasoning?.output || 0) + 
         (usage.reasoning?.cached || 0) +
         (usage.embeddings?.tokens || 0);
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
export function getResponseFromChunks(chunks: Chunk[], model: ModelInput = 'unknown'): Response {
  const resp: Response = { 
    content: '',
    finishReason: 'stop', 
    model,
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