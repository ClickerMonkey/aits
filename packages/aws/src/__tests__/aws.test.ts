/**
 * AWS Bedrock Provider Tests
 * 
 * Note: These tests verify the provider structure without making actual AWS API calls.
 * For integration tests with real AWS credentials, see __integration__ tests.
 */

import { AWSError, AWSAuthError, AWSRateLimitError } from '../types';

describe('AWSBedrockProvider Types', () => {
  describe('Error classes', () => {
    it('should create AWSError', () => {
      const error = new AWSError('Test error');
      expect(error).toBeDefined();
      expect(error.message).toContain('[aws-bedrock] Test error');
      expect(error.name).toBe('AWSError');
    });

    it('should create AWSAuthError', () => {
      const error = new AWSAuthError();
      expect(error).toBeDefined();
      expect(error.message).toContain('Authentication failed');
      expect(error.name).toBe('AWSAuthError');
    });

    it('should create AWSRateLimitError', () => {
      const error = new AWSRateLimitError('Rate limited', 60);
      expect(error).toBeDefined();
      expect(error.message).toContain('Rate limited');
      expect(error.retryAfter).toBe(60);
      expect(error.name).toBe('AWSRateLimitError');
    });
  });
});


