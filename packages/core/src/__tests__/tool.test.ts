/**
 * Tool Tests
 *
 * Tests for the Tool component including schema validation, execution, and error handling.
 */

import { z } from 'zod';
import { Tool } from '../tool';
import type { Context } from '../types';

describe('Tool', () => {
  describe('Construction', () => {
    it('should create a tool with required fields', () => {
      const tool = new Tool({
        name: 'test-tool',
        description: 'A test tool',
        instructions: 'Use this tool for testing',
        schema: z.object({ value: z.number() }),
        call: (input) => input.value * 2
      });

      expect(tool.name).toBe('test-tool');
      expect(tool.description).toBe('A test tool');
      expect(tool.kind).toBe('tool');
    });

    it('should accept refs to other components', () => {
      const dependency = new Tool({
        name: 'dependency',
        description: 'Dependency tool',
        instructions: 'A dependency',
        schema: z.object({}),
        call: () => 'dep-result'
      });

      const tool = new Tool({
        name: 'main-tool',
        description: 'Main tool',
        instructions: 'Main tool',
        schema: z.object({}),
        refs: [dependency],
        call: (input, refs) => {
          return `Used ${refs[0].name}`;
        }
      });

      expect(tool.refs).toHaveLength(1);
      expect(tool.refs[0].name).toBe('dependency');
    });
  });

  describe('Schema Validation', () => {
    it('should parse valid input', async () => {
      const tool = new Tool({
        name: 'calculator',
        description: 'Calculates things',
        instructions: 'Use for math',
        schema: z.object({
          operation: z.enum(['add', 'subtract']),
          a: z.number(),
          b: z.number()
        }),
        call: (input) => {
          return input.operation === 'add' ? input.a + input.b : input.a - input.b;
        }
      });

      const ctx = {} as Context<{}, {}>;
      const args = JSON.stringify({ operation: 'add', a: 5, b: 3 });

      const parsed = await tool.parse(ctx, args);

      expect(parsed).toEqual({ operation: 'add', a: 5, b: 3 });
    });

    it('should reject invalid input', async () => {
      const tool = new Tool({
        name: 'validator',
        description: 'Validates input',
        instructions: 'Strict validation',
        schema: z.object({ value: z.number().positive() }),
        call: (input) => input.value
      });

      const ctx = {} as Context<{}, {}>;
      const invalidArgs = JSON.stringify({ value: -5 });

      await expect(tool.parse(ctx, invalidArgs)).rejects.toThrow();
    });

    it('should handle malformed JSON', async () => {
      const tool = new Tool({
        name: 'json-tool',
        description: 'Requires JSON',
        instructions: 'JSON only',
        schema: z.object({ data: z.string() }),
        call: (input) => input.data
      });

      const ctx = {} as Context<{}, {}>;
      const malformedArgs = '{ invalid json }';

      await expect(tool.parse(ctx, malformedArgs)).rejects.toThrow();
    });

    it('should use custom validation', async () => {
      const tool = new Tool({
        name: 'custom-validator',
        description: 'Has custom validation',
        instructions: 'Custom rules',
        schema: z.object({ email: z.string().email() }),
        validate: async (input) => {
          if (input.email.endsWith('@blocked.com')) {
            throw new Error('Domain blocked');
          }
        },
        call: (input) => `Validated: ${input.email}`
      });

      const ctx = {} as Context<{}, {}>;

      // Should pass Zod validation but fail custom validation
      const blockedArgs = JSON.stringify({ email: 'user@blocked.com' });
      await expect(tool.parse(ctx, blockedArgs)).rejects.toThrow('Domain blocked');

      // Should pass both validations
      const validArgs = JSON.stringify({ email: 'user@allowed.com' });
      const parsed = await tool.parse(ctx, validArgs);
      expect(parsed.email).toBe('user@allowed.com');
    });
  });

  describe('Execution', () => {
    it('should execute successfully', async () => {
      const tool = new Tool({
        name: 'multiply',
        description: 'Multiplies numbers',
        instructions: 'Multiply two numbers',
        schema: z.object({ a: z.number(), b: z.number() }),
        call: (input) => input.a * input.b
      });

      const ctx = {} as Context<{}, {}>;
      const result = await tool.run({ a: 6, b: 7 }, ctx);

      expect(result).toBe(42);
    });

    it('should pass context to call function', async () => {
      const tool = new Tool({
        name: 'context-reader',
        description: 'Reads context',
        instructions: 'Accesses context',
        schema: z.object({ key: z.string() }),
        call: (input, refs, ctx: any) => {
          return `${input.key}: ${ctx.userId}`;
        }
      });

      const ctx = { userId: 'user-123' } as Context<{}, {}>;
      const result = await tool.run({ key: 'id' }, ctx);

      expect(result).toBe('id: user-123');
    });

    it('should pass refs to call function', async () => {
      const helperTool = new Tool({
        name: 'helper',
        description: 'Helper tool',
        instructions: 'Helps',
        schema: z.object({}),
        call: () => 'helper-result'
      });

      const mainTool = new Tool({
        name: 'main',
        description: 'Main tool',
        instructions: 'Uses helper',
        schema: z.object({}),
        refs: [helperTool],
        call: async (input, refs, ctx) => {
          const helperResult = await refs[0].run({}, ctx);
          return `Main used: ${helperResult}`;
        }
      });

      const ctx = {} as Context<{}, {}>;
      const result = await mainTool.run({}, ctx);

      expect(result).toBe('Main used: helper-result');
    });

    it('should handle async execution', async () => {
      const tool = new Tool({
        name: 'async-tool',
        description: 'Async operations',
        instructions: 'Waits',
        schema: z.object({ delay: z.number() }),
        call: async (input) => {
          await new Promise(resolve => setTimeout(resolve, input.delay));
          return `Waited ${input.delay}ms`;
        }
      });

      const ctx = {} as Context<{}, {}>;
      const result = await tool.run({ delay: 10 }, ctx);

      expect(result).toBe('Waited 10ms');
    });
  });

  describe('Error Handling', () => {
    it('should propagate execution errors', async () => {
      const tool = new Tool({
        name: 'error-tool',
        description: 'Throws errors',
        instructions: 'Will fail',
        schema: z.object({}),
        call: () => {
          throw new Error('Execution failed');
        }
      });

      const ctx = {} as Context<{}, {}>;

      expect(() => tool.run({}, ctx)).toThrow('Execution failed');
    });

    it('should handle schema resolution errors', async () => {
      const tool = new Tool({
        name: 'no-schema',
        description: 'Missing schema',
        instructions: 'No schema',
        schema: () => undefined,
        call: (input) => 'result'
      });

      const ctx = {} as Context<{}, {}>;

      await expect(tool.parse(ctx, '{}')).rejects.toThrow('Not able to build a schema');
    });
  });

  describe('Definition Generation', () => {
    it('should compile tool definition for AI', async () => {
      const tool = new Tool({
        name: 'weather',
        description: 'Get weather information',
        instructions: 'Use this to get weather for location',
        schema: z.object({
          location: z.string().describe('The city name'),
          unit: z.enum(['celsius', 'fahrenheit']).optional()
        }),
        call: (input) => `Weather for ${input.location}`
      });

      const ctx = {} as Context<{}, {}>;
      const compiled = await tool.compile(ctx);

      expect(compiled).toBeDefined();
      const [instructions, definition] = compiled!;

      expect(instructions).toContain('Use this to get weather for location');
      expect(definition.name).toBe('weather');
      expect(definition.description).toBe('Get weather information');
      expect(definition.parameters).toBeDefined();
    });

    it('should include instructions with template variables', async () => {
      const tool = new Tool({
        name: 'calculator',
        description: 'Calculate',
        instructions: 'Perform {{operation}} on the numbers',
        input: () => ({ operation: 'addition' }),
        schema: z.object({ a: z.number(), b: z.number() }),
        call: (input) => input.a + input.b
      });

      const ctx = {} as Context<{}, {}>;
      const compiled = await tool.compile(ctx);

      expect(compiled).toBeDefined();
      const [instructions] = compiled!;
      expect(instructions).toContain('Perform addition on the numbers');
    });

    it('should return undefined when schema is not available', async () => {
      const tool = new Tool({
        name: 'no-schema',
        description: 'No schema available',
        instructions: 'Will not compile',
        schema: () => undefined,
        call: () => 'result'
      });

      const ctx = {} as Context<{}, {}>;
      const compiled = await tool.compile(ctx);

      expect(compiled).toBeUndefined();
    });
  });

  describe('Applicability', () => {
    it('should be applicable when schema is available and no refs', async () => {
      const tool = new Tool({
        name: 'always-available',
        description: 'Always available',
        instructions: 'Always works',
        schema: z.object({}),
        call: () => 'result'
      });

      const ctx = {} as Context<{}, {}>;
      const applicable = await tool.applicable(ctx);

      // With no refs and schema available, should be applicable (self-contained tool)
      expect(applicable).toBe(true);
    });

    it('should be applicable with custom applicability returning true', async () => {
      const tool = new Tool({
        name: 'custom-applicable',
        description: 'Custom check',
        instructions: 'Custom',
        schema: z.object({}),
        applicable: () => true,
        call: () => 'result'
      });

      const ctx = {} as Context<{}, {}>;
      const applicable = await tool.applicable(ctx);

      expect(applicable).toBe(true);
    });

    it('should respect custom applicability', async () => {
      const tool = new Tool({
        name: 'conditional',
        description: 'Conditionally available',
        instructions: 'Sometimes works',
        schema: z.object({}),
        applicable: (ctx: any) => ctx.hasPermission === true,
        call: () => 'result'
      });

      const allowedCtx = { hasPermission: true } as Context<{}, {}>;
      const deniedCtx = { hasPermission: false } as Context<{}, {}>;

      expect(await tool.applicable(allowedCtx)).toBe(true);
      expect(await tool.applicable(deniedCtx)).toBe(false);
    });

    it('should support async applicability checks', async () => {
      const tool = new Tool({
        name: 'async-check',
        description: 'Async check',
        instructions: 'Async',
        schema: z.object({}),
        applicable: async (ctx: any) => {
          // Simulate async check (e.g., database query)
          await new Promise(resolve => setTimeout(resolve, 10));
          return ctx.userId === 'admin';
        },
        call: () => 'admin-only-result'
      });

      const adminCtx = { userId: 'admin' } as Context<{}, {}>;
      const userCtx = { userId: 'user' } as Context<{}, {}>;

      expect(await tool.applicable(adminCtx)).toBe(true);
      expect(await tool.applicable(userCtx)).toBe(false);
    });

    it('should return false when schema is undefined', async () => {
      const tool = new Tool({
        name: 'no-schema',
        description: 'No schema',
        instructions: 'Instructions',
        schema: () => undefined,
        call: () => 'result'
      });

      const ctx = {} as Context<{}, {}>;
      const applicable = await tool.applicable(ctx);

      expect(applicable).toBe(false);
    });

    it('should check refs applicability when tool has refs', async () => {
      const applicableTool = new Tool({
        name: 'available',
        description: 'Available',
        instructions: 'Available',
        schema: z.object({}),
        call: () => 'result'
      });

      const notApplicableTool = new Tool({
        name: 'not-available',
        description: 'Not available',
        instructions: 'Not available',
        schema: () => undefined, // Not applicable
        call: () => 'result'
      });

      // Tool with at least one applicable ref
      const tool = new Tool({
        name: 'with-refs',
        description: 'With refs',
        instructions: 'With refs',
        schema: z.object({}),
        refs: [applicableTool, notApplicableTool],
        call: (input, [available, notAvailable]) => 'result'
      });

      const ctx = {} as Context<{}, {}>;
      const applicable = await tool.applicable(ctx);

      // Should be true because at least one ref is applicable
      expect(applicable).toBe(true);
    });

    it('should return false when all refs are not applicable', async () => {
      const notApplicableTool1 = new Tool({
        name: 'not-available-1',
        description: 'Not available 1',
        instructions: 'Not available',
        schema: () => undefined,
        call: () => 'result'
      });

      const notApplicableTool2 = new Tool({
        name: 'not-available-2',
        description: 'Not available 2',
        instructions: 'Not available',
        schema: () => undefined,
        call: () => 'result'
      });

      const tool = new Tool({
        name: 'all-refs-unavailable',
        description: 'All refs unavailable',
        instructions: 'Instructions',
        schema: z.object({}),
        refs: [notApplicableTool1, notApplicableTool2],
        call: (input, refs) => 'result'
      });

      const ctx = {} as Context<{}, {}>;
      const applicable = await tool.applicable(ctx);

      // Should be false because no refs are applicable
      expect(applicable).toBe(false);
    });
  });

  describe('Compile', () => {
    it('should return undefined when instructions are empty', async () => {
      const tool = new Tool({
        name: 'no-instructions',
        description: 'No instructions',
        instructions: '', // Empty instructions
        schema: z.object({}),
        call: () => 'result'
      });

      const ctx = {} as Context<{}, {}>;
      const compiled = await tool.compile(ctx);

      expect(compiled).toBeUndefined();
    });

    it('should compile successfully with instructions', async () => {
      const tool = new Tool({
        name: 'with-instructions',
        description: 'With instructions',
        instructions: 'Use this tool to do something',
        schema: z.object({ value: z.number() }),
        call: (input) => input.value * 2
      });

      const ctx = {} as Context<{}, {}>;
      const compiled = await tool.compile(ctx);

      expect(compiled).toBeDefined();
      expect(compiled![0]).toBe('Use this tool to do something');
      expect(compiled![1].name).toBe('with-instructions');
      expect(compiled![1].description).toBe('With instructions');
    });
  });

  describe('Custom Runner', () => {
    it('should use custom runner when provided', () => {
      const tool = new Tool({
        name: 'with-runner',
        description: 'With runner',
        instructions: 'Instructions',
        schema: z.object({ value: z.number() }),
        call: (input) => input.value * 2
      });

      let runnerCalled = false;
      const ctx: Context<{}, {}> = {
        runner: (component, input, ctx, defaultRun) => {
          runnerCalled = true;
          expect(component).toBe(tool);
          expect(input.value).toBe(5);
          // Call default implementation
          return defaultRun(ctx);
        },
        messages: []
      };

      const result = tool.run({ value: 5 }, ctx);

      expect(runnerCalled).toBe(true);
      expect(result).toBe(10);
    });

    it('should allow runner to modify behavior', () => {
      const tool = new Tool({
        name: 'logging-tool',
        description: 'Logging tool',
        instructions: 'Instructions',
        schema: z.object({ value: z.number() }),
        call: (input) => input.value * 2
      });

      const executionLog: string[] = [];

      const ctx: Context<{}, {}> = {
        runner: (component, input, ctx, defaultRun) => {
          executionLog.push(`Before: ${input.value}`);
          const result = defaultRun(ctx);
          executionLog.push(`After: ${result}`);
          return result;
        },
        messages: []
      };

      const result = tool.run({ value: 10 }, ctx);

      expect(result).toBe(20);
      expect(executionLog).toEqual(['Before: 10', 'After: 20']);
    });
  });
});
