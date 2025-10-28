/**
 * Test Fixtures
 *
 * Common test data used across multiple test files.
 */

import z from 'zod';
import type { Message, Request, Response, Chunk, ToolCall } from '../../types';

// ============================================================================
// Messages
// ============================================================================

export const mockUserMessage: Message = {
  role: 'user',
  content: 'Hello, how are you?'
};

export const mockAssistantMessage: Message = {
  role: 'assistant',
  content: 'I am doing well, thank you!'
};

export const mockSystemMessage: Message = {
  role: 'system',
  content: 'You are a helpful assistant.'
};

export const mockMessages: Message[] = [
  mockSystemMessage,
  mockUserMessage,
  mockAssistantMessage
];

export const mockMultimodalMessage: Message = {
  role: 'user',
  content: [
    { type: 'text', content: 'What is in this image?' },
    { type: 'image', content: 'https://example.com/image.jpg' }
  ]
};

// ============================================================================
// Requests
// ============================================================================

export const mockRequest: Request = {
  messages: [mockUserMessage],
  maxTokens: 100,
  temperature: 0.7
};

export const mockRequestWithSystem: Request = {
  messages: [mockSystemMessage, mockUserMessage],
  maxTokens: 100
};

export const mockRequestWithTools: Request = {
  messages: [mockUserMessage],
  tools: [
    {
      name: 'calculator',
      description: 'Performs calculations',
      parameters: z.object({
        operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
        a: z.number(),
        b: z.number()
      }),
    }
  ]
};

// ============================================================================
// Responses
// ============================================================================

export const mockResponse: Response = {
  content: 'This is a mock response',
  finishReason: 'stop',
  usage: {
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30
  },
  model: 'mock-model',
};

export const mockResponseWithToolCalls: Response = {
  content: '',
  finishReason: 'tool_calls',
  toolCalls: [
    {
      id: 'call_123',
      name: 'calculator',
      arguments: '{ "operation": "add", "a": 5, "b": 3 }',
    }
  ],
  usage: {
    inputTokens: 15,
    outputTokens: 5,
    totalTokens: 20
  },
  model: 'mock-model',
};

export const mockResponseWithRefusal: Response = {
  content: '',
  finishReason: 'stop',
  refusal: 'I cannot help with that request',
  usage: {
    inputTokens: 8,
    outputTokens: 12,
    totalTokens: 20
  },
  model: 'mock-model',
};

// ============================================================================
// Chunks
// ============================================================================

export const mockChunks: Chunk[] = [
  { content: 'Hello' },
  { content: ' there' },
  { content: '!', finishReason: 'stop', usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 } }
];

export const mockChunksWithToolCalls: Chunk[] = [
  { content: '' },
  {
    content: '',
    finishReason: 'tool_calls',
    toolCall: {
      id: 'call_456',
      name: 'get_weather',
      arguments: '{ "location": "San Francisco" }'
    },
    usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 }
  }
];

// ============================================================================
// Tool Calls
// ============================================================================

export const mockToolCall: ToolCall = {
  id: 'call_789',
  name: 'search',
  arguments: '{ "query": "typescript testing" }'
};

export const mockToolCalls: ToolCall[] = [
  {
    id: 'call_001',
    name: 'calculator',
    arguments: '{ "operation": "multiply", "a": 6, "b": 7 }'
  },
  {
    id: 'call_002',
    name: 'get_time',
    arguments: '{}'
  }
];

// ============================================================================
// Context
// ============================================================================

export const mockContext = {
  userId: 'user-123',
  sessionId: 'session-456',
  timestamp: new Date('2024-01-01T00:00:00Z')
};

export const mockContextWithExecutor = {
  ...mockContext,
  execute: async () => mockResponse,
  stream: async function* () {
    for (const chunk of mockChunks) {
      yield chunk;
    }
  }
};

// ============================================================================
// Metadata
// ============================================================================

export const mockMetadata = {
  model: 'gpt-4',
  maxTokens: 100,
  temperature: 0.7
};
