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
        text: {
          input: 10,
          output: 20
        }
      };

      const add: Usage = {
        text: {
          input: 5,
          output: 15
        }
      };

      accumulateUsage(target, add);

      expect(target).toEqual({
        text: {
          input: 15,
          output: 35
        }
      });
    });

    it('should handle partial usage stats', () => {
      const target: Usage = {
        text: {
          input: 10,
          output: 20
        }
      };

      const add: Usage = {
        text: {
          input: 5
        }
      };

      accumulateUsage(target, add);

      expect(target.text!.input).toBe(15);
      expect(target.text!.output).toBe(20);
    });

    it('should handle undefined add parameter', () => {
      const target: Usage = {
        text: {
          input: 10,
          output: 20
        }
      };

      accumulateUsage(target, undefined);

      expect(target).toEqual({
        text: {
          input: 10,
          output: 20
        }
      });
    });

    it('should accumulate optional fields', () => {
      const target: Usage = {
        text: {
          input: 10,
          output: 20,
          cached: 5
        },
        cost: 0.001
      };

      const add: Usage = {
        text: {
          input: 5,
          output: 10,
          cached: 3
        },
        cost: 0.002
      };

      accumulateUsage(target, add);

      expect(target.text!.input).toBe(15);
      expect(target.text!.output).toBe(30);
      expect(target.text!.cached).toBe(8);
      expect(target.cost).toBeCloseTo(0.003);
    });

    it('should handle missing text property in target', () => {
      const target: Usage = {};

      const add: Usage = {
        text: {
          input: 10,
          output: 20
        }
      };

      accumulateUsage(target, add);

      expect(target.text).toEqual({
        input: 10,
        output: 20
      });
    });
  });
});
