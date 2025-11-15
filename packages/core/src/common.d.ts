import { Chunk, Model, ModelInput, Response, Runner, Usage, Events } from "./types";
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
export type FnResult<R> = R extends Promise<infer U> ? U : R extends (...args: any[]) => infer V ? V extends Promise<infer W> ? W : V : R;
/**
 * Retrieves the argument types A from a flexible function type Fn.
 */
export type FnArgs<F, Assumed = never> = F extends (...args: infer A) => any ? A : Assumed;
/**
 * Resolves a flexible function type into its standardized async function form.
 */
export type FnResolved<F extends Fn<any, any> | undefined> = F extends undefined ? () => Promise<undefined> : F extends Fn<infer R, infer A> ? (...args: A) => Promise<R> : never;
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
export declare function resolveFn<R, A extends [any?, ...any[]] = []>(fn: undefined): ((...args: A) => Promise<undefined>);
export declare function resolveFn<R, A extends [any?, ...any[]] = []>(fn: Fn<R, A>): ((...args: A) => Promise<R>);
export declare function resolveFn<R, A extends [any?, ...any[]] = [], R2 = R>(fn: Fn<R, A>, reprocess: (r: R) => R2): ((...args: A) => Promise<R2>);
/**
 * Checks if a promise has settled (either fulfilled or rejected).
 *
 * @param p - The promise to check.
 * @returns A promise that resolves to true if settled, false otherwise.
 */
export declare function isSettled(p: Promise<any>): Promise<boolean>;
/**
 * Type guard to check if a value is a Promise.
 *
 * @param value - The value to check.
 * @returns True if the value is a Promise, false otherwise.
 */
export declare function isPromise<T = any>(value: any): value is Promise<T>;
/**
 * Type guard to check if a value is an AsyncGenerator.
 *
 * @param value - The value to check.
 * @returns True if the value is an AsyncGenerator, false otherwise.
 */
export declare function isAsyncGenerator(value: any): value is AsyncGenerator<any, any, any>;
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
export declare function yieldAll<T>(promises: Promise<T>[]): AsyncGenerator<{
    result: Promise<T>;
    index: number;
}>;
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
export declare function resolve(input: any): Promise<any>;
/**
 * Consumes all values from an AsyncGenerator and returns them as an array.
 *
 * @param gen - The AsyncGenerator to consume.
 * @returns An array of all values yielded by the generator.
 */
export declare function consumeAll<E>(gen: AsyncGenerator<E, any, any>): Promise<E[]>;
/**
 * Resolves the type R from a value passed to `resolve`.
 */
export type Resolved<T> = T extends Promise<infer U> ? Resolved<U> : T extends AsyncGenerator<any, infer U, any> ? Resolved<U> : T;
/**
 * Accumulates usage statistics by adding values from one Usage object to another.
 *
 * @param target - The target Usage object to accumulate into.
 * @param add - The Usage object to add from.
 * @returns
 */
export declare function accumulateUsage(target: Usage, add?: Usage): void;
/**
 * Gets a Model object from either a string ID or a ModelInput object.
 *
 * @param input - The model identifier or ModelInput object.
 * @returns
 */
export declare function getModel(input: ModelInput): Model;
export declare function getModel(input: ModelInput | undefined): Model | undefined;
/**
 * Converts a series of chunks into a Response object.
 *
 * @param chunks - The array of Chunk objects to convert.
 * @returns The aggregated Response object.
 */
export declare function getResponseFromChunks(chunks: Chunk[]): Response;
/**
 * Converts a Response object into an array of Chunk objects.
 *
 * @param response - The response to convert.
 * @returns The built chunks from the response.
 */
export declare function getChunksFromResponse(response: Response): Chunk[];
/**
 * Creates a runner that emits events during component execution.
 *
 * @param events
 * @returns
 */ export declare function withEvents<TRoot extends AnyComponent>(events: Events<TRoot>): Runner;
//# sourceMappingURL=common.d.ts.map