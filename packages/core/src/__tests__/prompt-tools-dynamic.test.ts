/**
 * Tests for toolsDynamic functionality in Prompt
 */

import { z } from 'zod';
import { Prompt } from '../prompt';
import { Tool } from '../tool';
import { Context } from '../types';
import { createMockExecutor } from './mocks/executor.mock';

describe('Prompt toolsDynamic', () => {
  it('should re-evaluate tools on each iteration when toolsDynamic is true', async () => {
    let callCount = 0;
    let toolApplicableCalls = 0;

    const conditionalTool = new Tool({
      name: 'conditional-tool',
      description: 'Tool that becomes unavailable after first check',
      instructions: 'Use this tool',
      schema: z.object({ value: z.string() }),
      call: (args) => `Called with: ${args.value}`,
      applicable: async () => {
        toolApplicableCalls++;
        // Only applicable on first two checks (initial + first iteration)
        return toolApplicableCalls <= 2;
      }
    });

    const alwaysAvailableTool = new Tool({
      name: 'always-tool',
      description: 'Tool that is always available',
      instructions: 'Always available',
      schema: z.object({ value: z.string() }),
      call: (args) => `Always: ${args.value}`,
      applicable: async () => true
    });

    const prompt = new Prompt({
      name: 'dynamic-tools-test',
      description: 'Test dynamic tools',
      content: 'Test',
      tools: [conditionalTool, alwaysAvailableTool],
      toolsDynamic: true
    });

    const executor = jest.fn(async (request) => {
      callCount++;
      
      // First iteration: both tools should be available
      if (callCount === 1) {
        expect(request.tools?.length).toBe(2);
        return {
          content: '',
          finishReason: 'tool_calls' as const,
          toolCalls: [{
            id: 'call_1',
            name: 'conditional-tool',
            arguments: '{"value": "test"}'
          }],
          model: 'model-abc',
        };
      }
      
      // Second iteration: only always-tool should be available (conditional-tool becomes unavailable)
      if (callCount === 2) {
        expect(request.tools?.length).toBe(1);
        expect(request.tools?.[0].name).toBe('always-tool');
        return {
          content: 'Done',
          finishReason: 'stop' as const,
          model: 'model-abc',
        };
      }

      return {
        content: 'Done',
        finishReason: 'stop' as const,
        model: 'model-abc',
      };
    });

    const ctx: Context<{}, {}> = {
      execute: executor,
      messages: []
    };

    const result = await prompt.get('result', {}, ctx);
    expect(result).toBe('Done');
    expect(callCount).toBe(2);
    // Should be called at least 3 times (initial + 2 iterations)
    expect(toolApplicableCalls).toBeGreaterThanOrEqual(3);
  });

  it('should not re-evaluate tools when toolsDynamic is false', async () => {
    let callCount = 0;
    let toolApplicableCalls = 0;

    const conditionalTool = new Tool({
      name: 'conditional-tool',
      description: 'Tool with applicable check',
      instructions: 'Use this tool',
      schema: z.object({ value: z.string() }),
      call: (args) => `Called with: ${args.value}`,
      applicable: async () => {
        toolApplicableCalls++;
        return true;
      }
    });

    const prompt = new Prompt({
      name: 'static-tools-test',
      description: 'Test static tools',
      content: 'Test',
      tools: [conditionalTool],
      toolsDynamic: false // Explicitly false
    });

    const executor = jest.fn(async (request) => {
      callCount++;
      
      if (callCount === 1) {
        return {
          content: '',
          finishReason: 'tool_calls' as const,
          toolCalls: [{
            id: 'call_1',
            name: 'conditional-tool',
            arguments: '{"value": "test"}'
          }],
          model: 'model-abc',
        };
      }

      return {
        content: 'Done',
        finishReason: 'stop' as const,
        model: 'model-abc',
      };
    });

    const ctx: Context<{}, {}> = {
      execute: executor,
      messages: []
    };

    const result = await prompt.get('result', {}, ctx);
    expect(result).toBe('Done');
    expect(callCount).toBe(2);
    // Should only be called once during initial resolution
    expect(toolApplicableCalls).toBe(1);
  });

  it('should work with retool function and toolsDynamic', async () => {
    let callCount = 0;
    let retoolCalls = 0;

    const tool1 = new Tool({
      name: 'tool1',
      description: 'First tool',
      instructions: 'Tool 1',
      schema: z.object({}),
      call: () => 'result1'
    });

    const tool2 = new Tool({
      name: 'tool2',
      description: 'Second tool',
      instructions: 'Tool 2',
      schema: z.object({}),
      call: () => 'result2'
    });

    const prompt = new Prompt({
      name: 'retool-dynamic-test',
      description: 'Test retool with dynamic',
      content: 'Test',
      tools: [tool1, tool2],
      toolsDynamic: true,
      retool: () => {
        retoolCalls++;
        // First two calls: return both tools, third call onwards: return only tool2
        return retoolCalls <= 2 ? ['tool1', 'tool2'] : ['tool2'];
      }
    });

    const executor = jest.fn(async (request) => {
      callCount++;
      
      if (callCount === 1) {
        expect(request.tools?.length).toBe(2);
        return {
          content: '',
          finishReason: 'tool_calls' as const,
          toolCalls: [{
            id: 'call_1',
            name: 'tool1',
            arguments: '{}'
          }],
          model: 'model-abc',
        };
      }
      
      if (callCount === 2) {
        expect(request.tools?.length).toBe(1);
        expect(request.tools?.[0].name).toBe('tool2');
        return {
          content: 'Done',
          finishReason: 'stop' as const,
          model: 'model-abc',
        };
      }

      return {
        content: 'Done',
        finishReason: 'stop' as const,
        model: 'model-abc',
      };
    });

    const ctx: Context<{}, {}> = {
      execute: executor,
      messages: []
    };

    const result = await prompt.get('result', {}, ctx);
    expect(result).toBe('Done');
    expect(retoolCalls).toBeGreaterThanOrEqual(3);
  });

  it('should handle case when all tools become unavailable dynamically', async () => {
    let callCount = 0;
    let applicableCallCount = 0;

    const tool = new Tool({
      name: 'disappearing-tool',
      description: 'Tool that disappears',
      instructions: 'Use this',
      schema: z.object({}),
      call: () => 'result',
      applicable: async () => {
        applicableCallCount++;
        // Only available on first two checks (initial resolution + first iteration)
        return applicableCallCount <= 2;
      }
    });

    const prompt = new Prompt({
      name: 'disappearing-tools-test',
      description: 'Test tools disappearing',
      content: 'Test',
      tools: [tool],
      toolsDynamic: true
    });

    const executor = jest.fn(async (request) => {
      callCount++;
      
      if (callCount === 1) {
        expect(request.tools?.length).toBe(1);
        return {
          content: '',
          finishReason: 'tool_calls' as const,
          toolCalls: [{
            id: 'call_1',
            name: 'disappearing-tool',
            arguments: '{}'
          }],
          model: 'model-abc',
        };
      }
      
      // Second iteration: no tools should be available (empty array or undefined)
      if (callCount === 2) {
        expect(request.tools === undefined || request.tools?.length === 0).toBe(true);
        return {
          content: 'Done',
          finishReason: 'stop' as const,
          model: 'model-abc',
        };
      }

      return {
        content: 'Done',
        finishReason: 'stop' as const,
        model: 'model-abc',
      };
    });

    const ctx: Context<{}, {}> = {
      execute: executor,
      messages: []
    };

    const result = await prompt.get('result', {}, ctx);
    expect(result).toBe('Done');
  });

  it('should check tool applicability during initial resolution', async () => {
    let applicableCalls = 0;

    const tool = new Tool({
      name: 'test-tool',
      description: 'Test tool',
      instructions: 'Test',
      schema: z.object({}),
      call: () => 'result',
      applicable: async () => {
        applicableCalls++;
        return true;
      }
    });

    const prompt = new Prompt({
      name: 'initial-applicable-test',
      description: 'Test initial applicable',
      content: 'Test',
      tools: [tool]
      // toolsDynamic not set, should still check applicable initially
    });

    const executor = jest.fn(async () => ({
      content: 'Done',
      finishReason: 'stop' as const,
      model: 'model-abc',
    }));

    const ctx: Context<{}, {}> = {
      execute: executor,
      messages: []
    };

    const result = await prompt.get('result', {}, ctx);
    expect(result).toBe('Done');
    // Should be called once during initial resolution
    expect(applicableCalls).toBe(1);
  });

  it('should filter out non-applicable tools during initial resolution', async () => {
    const applicableTool = new Tool({
      name: 'applicable-tool',
      description: 'Applicable',
      instructions: 'Available',
      schema: z.object({}),
      call: () => 'result',
      applicable: async () => true
    });

    const notApplicableTool = new Tool({
      name: 'not-applicable-tool',
      description: 'Not applicable',
      instructions: 'Not available',
      schema: z.object({}),
      call: () => 'result',
      applicable: async () => false
    });

    const prompt = new Prompt({
      name: 'filter-tools-test',
      description: 'Test filtering',
      content: 'Test',
      tools: [applicableTool, notApplicableTool]
    });

    const executor = jest.fn(async (request) => {
      // Only applicable tool should be in the request
      expect(request.tools?.length).toBe(1);
      expect(request.tools?.[0].name).toBe('applicable-tool');
      
      return {
        content: 'Done',
        finishReason: 'stop' as const,
        model: 'model-abc',
      };
    });

    const ctx: Context<{}, {}> = {
      execute: executor,
      messages: []
    };

    const result = await prompt.get('result', {}, ctx);
    expect(result).toBe('Done');
  });
});
