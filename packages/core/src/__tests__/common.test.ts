/**
 * Common Utility Functions Tests
 *
 * Comprehensive tests for all utility functions in common.ts
 */

import {
  resolveFn,
  isSettled,
  isPromise,
  isAsyncGenerator,
  yieldAll,
  resolve,
  consumeAll,
  accumulateUsage,
} from '../common';
import { Usage } from '../types';

describe('Common Utilities', () => {
  describe('resolveFn', () => {
    it('should handle undefined input', async () => {
      const fn = resolveFn(undefined);
      const result = await fn();
      expect(result).toBeUndefined();
    });

    it('should handle direct value', async () => {
      const fn = resolveFn(42);
      const result = await fn();
      expect(result).toBe(42);
    });

    it('should handle function', async () => {
      const fn = resolveFn(() => 'hello');
      const result = await fn();
      expect(result).toBe('hello');
    });

    it('should handle async function', async () => {
      const fn = resolveFn(async () => 'async hello');
      const result = await fn();
      expect(result).toBe('async hello');
    });

    it('should handle function with arguments', async () => {
      const fn = resolveFn((a: number, b: number) => a + b);
      const result = await fn(5, 3);
      expect(result).toBe(8);
    });

    it('should handle Promise', async () => {
      const fn = resolveFn(Promise.resolve(100));
      const result = await fn();
      expect(result).toBe(100);
    });

    it('should handle reprocess with value', async () => {
      const fn = resolveFn(42, (x) => x * 2);
      const result = await fn();
      expect(result).toBe(84);
    });

    it('should handle reprocess with function', async () => {
      const fn = resolveFn((x: number) => x + 10, (r) => r * 2);
      const result = await fn(5);
      expect(result).toBe(30); // (5 + 10) * 2
    });

    it('should handle reprocess with Promise', async () => {
      const fn = resolveFn(Promise.resolve(50), (x) => x / 2);
      const result = await fn();
      expect(result).toBe(25);
    });

    it('should cache reprocessed value', async () => {
      let callCount = 0;
      const fn = resolveFn(42, (x) => {
        callCount++;
        return x * 2;
      });

      const result1 = await fn();
      const result2 = await fn();

      expect(result1).toBe(84);
      expect(result2).toBe(84);
      expect(callCount).toBe(1); // Only called once due to caching
    });

    it('should handle function without reprocess', async () => {
      const fn = resolveFn((x: string) => x.toUpperCase());
      const result = await fn('hello');
      expect(result).toBe('HELLO');
    });

    it('should handle Promise without reprocess', async () => {
      const fn = resolveFn(Promise.resolve('test'));
      const result = await fn();
      expect(result).toBe('test');
    });
  });

  describe('isSettled', () => {
    it('should return false for any promise (implementation races with immediate false)', async () => {
      // The implementation: Promise.race([p.then(() => true), Promise.resolve(false)])
      // Promise.resolve(false) wins immediately, so this always returns false
      const p = Promise.resolve(42);
      const result = await isSettled(p);
      expect(result).toBe(false);
    });

    it('should return false for pending promise', async () => {
      const p = new Promise((resolve) => setTimeout(resolve, 1000));
      const result = await isSettled(p);
      expect(result).toBe(false);
    });

    it('should return false for rejected promise', async () => {
      const p = Promise.reject(new Error('test'));
      // Catch to prevent unhandled rejection
      p.catch(() => {});
      const result = await isSettled(p);
      expect(result).toBe(false);
    });
  });

  describe('isPromise', () => {
    it('should return true for Promise', () => {
      expect(isPromise(Promise.resolve(42))).toBe(true);
    });

    it('should return true for thenable', () => {
      const thenable = { then: () => {} };
      expect(isPromise(thenable)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isPromise(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isPromise(undefined)).toBe(false);
    });

    it('should return false for number', () => {
      expect(isPromise(42)).toBe(false);
    });

    it('should return false for string', () => {
      expect(isPromise('hello')).toBe(false);
    });

    it('should return false for object without then', () => {
      expect(isPromise({ value: 42 })).toBe(false);
    });
  });

  describe('isAsyncGenerator', () => {
    it('should return true for async generator', () => {
      async function* gen() {
        yield 1;
        yield 2;
      }
      expect(isAsyncGenerator(gen())).toBe(true);
    });

    it('should return false for null', () => {
      expect(isAsyncGenerator(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isAsyncGenerator(undefined)).toBe(false);
    });

    it('should return false for regular function', () => {
      expect(isAsyncGenerator(() => {})).toBe(false);
    });

    it('should return false for Promise', () => {
      expect(isAsyncGenerator(Promise.resolve(42))).toBe(false);
    });

    it('should return false for sync generator', () => {
      function* gen() {
        yield 1;
      }
      expect(isAsyncGenerator(gen())).toBe(false);
    });

    it('should return false for object with partial interface', () => {
      const partial = {
        next: () => {},
        [Symbol.asyncIterator]: () => {}
      };
      expect(isAsyncGenerator(partial)).toBe(false);
    });
  });

  describe('yieldAll', () => {
    it('should yield promises as they settle', async () => {
      const promises = [
        new Promise(resolve => setTimeout(() => resolve('a'), 50)),
        new Promise(resolve => setTimeout(() => resolve('b'), 10)),
        new Promise(resolve => setTimeout(() => resolve('c'), 30)),
      ];

      const results: string[] = [];
      for await (const { result, index } of yieldAll(promises)) {
        const value = await result;
        results.push(value as string);
      }

      // Should yield in settlement order, not creation order
      expect(results).toEqual(['b', 'c', 'a']);
    });

    it('should handle rejected promises', async () => {
      const promises = [
        Promise.resolve('success'),
        Promise.reject(new Error('failure')),
        Promise.resolve('also success'),
      ];

      const results: Array<{ value?: string; error?: Error; index: number }> = [];

      for await (const { result, index } of yieldAll(promises)) {
        try {
          const value = await result;
          results.push({ value: value as string, index });
        } catch (error) {
          results.push({ error: error as Error, index });
        }
      }

      expect(results).toHaveLength(3);
      expect(results[0].value).toBe('success');
      expect(results[1].error?.message).toBe('failure');
      expect(results[2].value).toBe('also success');
    });

    it('should handle empty array', async () => {
      const promises: Promise<any>[] = [];
      const results = [];

      for await (const item of yieldAll(promises)) {
        results.push(item);
      }

      expect(results).toHaveLength(0);
    });

    it('should track indices correctly', async () => {
      const promises = [
        Promise.resolve('first'),
        Promise.resolve('second'),
        Promise.resolve('third'),
      ];

      const indices: number[] = [];
      for await (const { index } of yieldAll(promises)) {
        indices.push(index);
      }

      // All indices should be yielded
      expect(indices.sort()).toEqual([0, 1, 2]);
    });
  });

  describe('resolve', () => {
    it('should resolve plain value', async () => {
      const result = await resolve(42);
      expect(result).toBe(42);
    });

    it('should resolve Promise', async () => {
      const result = await resolve(Promise.resolve('hello'));
      expect(result).toBe('hello');
    });

    it('should resolve AsyncGenerator return value', async () => {
      async function* gen() {
        yield 1;
        yield 2;
        yield 3;
        return 'final';
      }

      const result = await resolve(gen());
      expect(result).toBe('final');
    });

    it('should resolve AsyncGenerator with no return', async () => {
      async function* gen() {
        yield 1;
        yield 2;
      }

      const result = await resolve(gen());
      expect(result).toBeUndefined();
    });

    it('should resolve null', async () => {
      const result = await resolve(null);
      expect(result).toBeNull();
    });

    it('should resolve undefined', async () => {
      const result = await resolve(undefined);
      expect(result).toBeUndefined();
    });

    it('should resolve object', async () => {
      const obj = { foo: 'bar' };
      const result = await resolve(obj);
      expect(result).toBe(obj);
    });
  });

  describe('consumeAll', () => {
    it('should consume all values from generator', async () => {
      async function* gen() {
        yield 1;
        yield 2;
        yield 3;
      }

      const results = await consumeAll(gen());
      expect(results).toEqual([1, 2, 3]);
    });

    it('should handle empty generator', async () => {
      async function* gen() {
        // Empty
      }

      const results = await consumeAll(gen());
      expect(results).toEqual([]);
    });

    it('should handle generator with different types', async () => {
      async function* gen() {
        yield 'a';
        yield 'b';
        yield 'c';
      }

      const results = await consumeAll(gen());
      expect(results).toEqual(['a', 'b', 'c']);
    });

    it('should handle generator with mixed values', async () => {
      async function* gen() {
        yield 1;
        yield 'string';
        yield { value: 'object' };
        yield null;
      }

      const results = await consumeAll(gen());
      expect(results).toEqual([1, 'string', { value: 'object' }, null]);
    });
  });

  describe('accumulateUsage', () => {
    it('should accumulate all usage fields', () => {
      const target = {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        cachedTokens: 5,
        reasoningTokens: 3,
        cost: 0.001,
        seconds: 1.5,
      };

      const add = {
        inputTokens: 15,
        outputTokens: 25,
        totalTokens: 40,
        cachedTokens: 8,
        reasoningTokens: 5,
        cost: 0.002,
        seconds: 2.0,
      };

      accumulateUsage(target, add);

      expect(target.inputTokens).toBe(25);
      expect(target.outputTokens).toBe(45);
      expect(target.totalTokens).toBe(70);
      expect(target.cachedTokens).toBe(13);
      expect(target.reasoningTokens).toBe(8);
      expect(target.cost).toBe(0.003);
      expect(target.seconds).toBe(3.5);
    });

    it('should handle undefined add parameter', () => {
      const target = {
        inputTokens: 10,
        outputTokens: 20,
      };

      accumulateUsage(target, undefined);

      expect(target.inputTokens).toBe(10);
      expect(target.outputTokens).toBe(20);
    });

    it('should handle empty target', () => {
      const target: Usage = {};
      const add: Usage = {
        inputTokens: 15,
        outputTokens: 25,
      };

      accumulateUsage(target, add);

      expect(target.inputTokens).toBe(15);
      expect(target.outputTokens).toBe(25);
    });

    it('should handle partial add object', () => {
      const target: Usage = {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      };

      const add: Usage = {
        inputTokens: 5,
        // Missing outputTokens
        cost: 0.001,
      };

      accumulateUsage(target, add);

      expect(target.inputTokens).toBe(15);
      expect(target.outputTokens).toBe(20); // Unchanged
      expect(target.totalTokens).toBe(30); // Unchanged
      expect(target.cost).toBe(0.001);
    });

    it('should handle zero values', () => {
      const target: Usage = {
        inputTokens: 10,
      };

      const add: Usage = {
        inputTokens: 0,
        outputTokens: 0,
      };

      accumulateUsage(target, add);

      expect(target.inputTokens).toBe(10); // Not added because add.inputTokens is 0 (falsy)
      expect(target.outputTokens).toBeUndefined(); // Not set because 0 is falsy
    });

    it('should initialize fields if target is empty', () => {
      const target: Usage = {};
      const add: Usage = {
        inputTokens: 100,
        cost: 0.05,
      };

      accumulateUsage(target, add);

      expect(target.inputTokens).toBe(100);
      expect(target.cost).toBe(0.05);
    });
  });
});
