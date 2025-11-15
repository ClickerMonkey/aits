/**
 * Chat API
 *
 * Provides chat completion functionality with automatic model selection, streaming support,
 * and lifecycle hooks. The Chat API is the primary interface for conversational AI.
 *
 * @example
 * ```typescript
 * // Simple chat completion
 * const response = await ai.chat.get([
 *   { role: 'user', content: 'What is TypeScript?' }
 * ]);
 * console.log(response.content);
 *
 * // Streaming chat
 * for await (const chunk of ai.chat.stream([
 *   { role: 'user', content: 'Write a poem about TypeScript' }
 * ])) {
 *   if (chunk.content) {
 *     process.stdout.write(chunk.content);
 *   }
 * }
 *
 * // With context and metadata
 * const response = await ai.chat.get(
 *   [{ role: 'user', content: 'Hello' }],
 *   {
 *     userId: '123',
 *     metadata: {
 *       model: 'gpt-4',
 *       required: ['chat', 'streaming']
 *     }
 *   }
 * );
 * ```
 */
import { getChunksFromResponse, getResponseFromChunks } from '@aits/core';
import { BaseAPI } from './base';
/**
 * ChatAPI provides methods for chat completions with automatic model selection.
 * Inherits get() and stream() methods from BaseAPI.
 *
 * @template T - AIBaseTypes container with all type information
 */
export class ChatAPI extends BaseAPI {
    constructor(ai) {
        super(ai);
    }
    // ============================================================================
    // REQUIRED ABSTRACT METHOD IMPLEMENTATIONS
    // ============================================================================
    getRequiredCapabilities(provided, request, forStreaming) {
        const capabilities = new Set(['chat', ...provided]);
        // Check if request contains images - requires vision capability
        if (request) {
            const hasImages = request.messages.some(message => {
                if (Array.isArray(message.content)) {
                    return message.content.some(part => part.type === 'image');
                }
                return false;
            });
            if (hasImages) {
                capabilities.add('vision');
            }
            const hasAudio = request.messages.some(message => {
                if (Array.isArray(message.content)) {
                    return message.content.some(part => part.type === 'audio');
                }
                return false;
            });
            if (hasAudio) {
                capabilities.add('hearing');
            }
            // Check if request uses reasoning
            if (request.reason !== undefined) {
                capabilities.add('reasoning');
            }
            // Check if request expects JSON output
            if (request.responseFormat) {
                if (request.responseFormat === 'json') {
                    capabilities.add('json');
                }
                else if (typeof request.responseFormat === 'object') {
                    capabilities.add('structured');
                }
            }
            // Check if request uses tools
            if (request.tools && request.tools.length > 0) {
                capabilities.add('tools');
            }
        }
        return Array.from(capabilities);
    }
    getRequiredParameters(provided, request, forStreaming) {
        const params = new Set([...provided]);
        if (request.maxTokens !== undefined) {
            params.add('maxTokens');
        }
        if (request.temperature !== undefined) {
            params.add('temperature');
        }
        if (request.topP !== undefined) {
            params.add('topP');
        }
        if (request.frequencyPenalty !== undefined) {
            params.add('frequencyPenalty');
        }
        if (request.presencePenalty !== undefined) {
            params.add('presencePenalty');
        }
        if (request.stop !== undefined) {
            params.add('stop');
        }
        if (request.logProbabilities !== undefined) {
            params.add('logProbabilities');
        }
        if (request.logitBias !== undefined) {
            params.add('logitBias');
        }
        if (request.responseFormat !== undefined) {
            params.add('responseFormat');
            if (typeof request.responseFormat === 'object') {
                params.add('structuredOutput');
            }
        }
        if (request.reason !== undefined) {
            params.add('reason');
        }
        if (request.tools !== undefined || request.toolChoice !== undefined) {
            params.add('tools');
            if (request.toolChoice !== undefined) {
                params.add('toolChoice');
            }
        }
        return Array.from(params);
    }
    getNoModelFoundError() {
        return 'No compatible model found for criteria';
    }
    getErrorType(operation) {
        return operation === 'request' ? 'chat-request-failed' : 'chat-stream-failed';
    }
    getErrorMessage(operation) {
        return operation === 'request' ? 'Chat request failed' : 'Chat streaming failed';
    }
    estimateRequestTokens(request, selected) {
        return this.ai.estimateRequestTokens(request);
    }
    async executeRequest(request, selected, ctx) {
        if (!selected.provider.createExecutor) {
            throw new Error(`Provider ${selected.provider.name} does not support chat requests`);
        }
        const executor = selected.provider.createExecutor(selected.providerConfig);
        return await executor(request, ctx, ctx.metadata);
    }
    async *executeStreamRequest(request, selected, ctx) {
        if (!selected.provider.createStreamer) {
            throw new Error(`Provider ${selected.provider.name} does not support chat streaming`);
        }
        const streamer = selected.provider.createStreamer(selected.providerConfig);
        yield* streamer(request, ctx, ctx.metadata);
    }
    responseToChunks(response) {
        return getChunksFromResponse(response);
    }
    chunksToResponse(chunks, model) {
        return getResponseFromChunks(chunks);
    }
    getHandlerGetMethod(handler) {
        return handler?.chat?.get;
    }
    getHandlerStreamMethod(handler) {
        return handler?.chat?.stream;
    }
    hasProviderExecutor(selected) {
        return !!selected.provider.createExecutor;
    }
    hasProviderStreamer(selected) {
        return !!selected.provider.createStreamer;
    }
    /**
     * Create an executor function for use in core Context.
     * This executor routes through ChatAPI's get method, allowing Prompts
     * to execute chat completions through the context.
     *
     * @returns Executor function
     * @internal
     */
    createExecutor() {
        return async (request, ctx, metadata, signal) => {
            return await this.get(request, { ...ctx, metadata, signal });
        };
    }
    /**
     * Create a streamer function for use in core Context.
     * This streamer routes through ChatAPI's stream method, allowing Prompts
     * to execute streaming chat completions through the context.
     *
     * @returns Streamer function
     * @internal
     */
    createStreamer() {
        const chatAPI = this;
        return async function* (request, ctx, metadata, signal) {
            const chunks = [];
            for await (const chunk of chatAPI.stream(request, { ...ctx, metadata, signal })) {
                yield chunk;
                chunks.push(chunk);
            }
            return chatAPI.chunksToResponse(chunks, 'unknown');
        };
    }
}
//# sourceMappingURL=chat.js.map