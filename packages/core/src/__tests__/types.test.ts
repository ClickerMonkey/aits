/**
 * Type Utility Tests
 *
 * Tests for type utilities and basic type operations.
 */

import { accumulateUsage } from '../common';
import type { Usage } from '../types';

describe('Type Utilities', () => {
  describe('accumulateUsage', () => {
    it('should accumulate usage stats', () => {
      const target: Usage = {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30
      };

      const add: Usage = {
        inputTokens: 5,
        outputTokens: 15,
        totalTokens: 20
      };

      accumulateUsage(target, add);

      expect(target).toEqual({
        inputTokens: 15,
        outputTokens: 35,
        totalTokens: 50
      });
    });

    it('should handle partial usage stats', () => {
      const target: Usage = {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30
      };

      const add: Partial<Usage> = {
        inputTokens: 5
      };

      accumulateUsage(target, add as Usage);

      expect(target.inputTokens).toBe(15);
      expect(target.outputTokens).toBe(20);
      expect(target.totalTokens).toBe(30);
    });

    it('should handle undefined add parameter', () => {
      const target: Usage = {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30
      };

      accumulateUsage(target, undefined);

      expect(target).toEqual({
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30
      });
    });

    it('should accumulate optional fields', () => {
      const target: Usage = {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        cachedTokens: 5,
        cost: 0.001
      };

      const add: Usage = {
        inputTokens: 5,
        outputTokens: 10,
        totalTokens: 15,
        cachedTokens: 3,
        cost: 0.002
      };

      accumulateUsage(target, add);

      expect(target.cachedTokens).toBe(8);
      expect(target.cost).toBeCloseTo(0.003);
    });
  });
});
