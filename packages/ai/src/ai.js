/**
 * AI Class - Main Entry Point
 *
 * Instance-based AI library similar to OpenAI's SDK.
 * Provides type-safe, scoped access to AI capabilities with hooks and context injection.
 */
import { Agent, Prompt, resolveFn, Tool } from '@aits/core';
import { ChatAPI } from './apis/chat';
import { EmbedAPI } from './apis/embed';
import { ImageAPI } from './apis/image';
import { ModelsAPI } from './apis/models';
import { SpeechAPI } from './apis/speech';
import { TranscribeAPI } from './apis/transcribe';
import { ModelRegistry } from './registry';
/**
 * AI Class
 *
 * @template T - AIBaseTypes container with all type information
 *
 * @example
 * ```typescript
 * const ai = AI.with<AppContext, AppMetadata>()
 *   .providers({ openai, openrouter })
 *   .create({
 *     defaultContext: { baseURL: 'https://api.example.com' },
 *     providedContext: async (ctx) => ({ db, user }),
 *     hooks: {
 *       beforeRequest: async (ctx, request, selected, estimatedTokens, estimatedCost) => {
 *         // Check budget
 *       },
 *       afterRequest: async (ctx, request, response, responseComplete, selected, usage, cost) => {
 *         // Track usage
 *       }
 *     }
 *   });
 *
 * // Use the API
 * const response = await ai.chat.get([{ role: 'user', content: 'Hi' }]);
 * ```
 */
export class AI {
    // Configuration
    config;
    registry;
    // API Surfaces
    chat;
    image;
    speech;
    transcribe;
    embed;
    models;
    // Direct Access
    providers;
    components = [];
    hooks;
    // Cumulative tracking for statistics
    cumulativeCost = 0;
    cumulativeLatency = 0;
    cumulativeRequestCount = 0;
    // Computed Values
    tokens;
    /**
     * Static builder for creating AI instances with type inference
     */
    static with() {
        return {
            providers: (providers) => {
                return {
                    create: (config) => {
                        return new AI({
                            providers,
                            ...config,
                        });
                    },
                };
            },
        };
    }
    constructor(config) {
        this.config = config;
        this.hooks = {};
        // Prepare model sources
        const modelSources = [...(config.modelSources || [])];
        // Register given models as a source so they are not lost on refresh
        if (config.models) {
            modelSources.unshift({
                name: 'config',
                fetchModels: async () => config.models,
            });
        }
        // Initialize registry with model sources
        this.registry = new ModelRegistry(config.providers, config.modelOverrides || [], config.defaultCostPerMillionTokens || 5.0, modelSources, config.defaultWeights, config.weightProfiles || {});
        // Push in given models without fetching
        if (config.models) {
            this.registry.registerModels(config.models);
        }
        // Register model handlers
        if (config.modelHandlers) {
            for (const handler of config.modelHandlers) {
                this.registry.registerHandler(handler);
            }
        }
        // Initialize API surfaces
        this.chat = new ChatAPI(this);
        this.image = new ImageAPI(this);
        this.speech = new SpeechAPI(this);
        this.transcribe = new TranscribeAPI(this);
        this.embed = new EmbedAPI(this);
        this.models = new ModelsAPI(this.registry);
        // Direct access to providers
        this.providers = config.providers;
        // Token calculation helpers
        this.tokens = {
            text: {
                divisor: this.config.tokens?.textDivisor || 4,
                base64Divisor: this.config.tokens?.textBase64Divisor || 3,
                fallback: this.config.tokens?.textFallback || 1000,
                max: this.config.tokens?.textMax,
            },
            image: {
                divisor: this.config.tokens?.imageDivisor || 1125,
                base64Divisor: this.config.tokens?.imageBase64Divisor || 1500,
                fallback: this.config.tokens?.imageFallback || 1360,
                max: this.config.tokens?.imageMax || 1360,
            },
            file: {
                divisor: this.config.tokens?.fileDivisor || 3,
                base64Divisor: this.config.tokens?.fileBase64Divisor || 4,
                fallback: this.config.tokens?.fileFallback || 1000,
                max: this.config.tokens?.fileMax,
            },
            audio: {
                divisor: this.config.tokens?.audioDivisor || 3,
                base64Divisor: this.config.tokens?.audioBase64Divisor || 4,
                fallback: this.config.tokens?.audioFallback || 200,
                max: this.config.tokens?.audioMax,
            },
        };
    }
    /**
     * Sets the hooks for this AI instance and returns the instance.
     *
     * @param hooks - Hooks to set
     * @returns this
     */
    withHooks(hooks) {
        this.hooks = hooks;
        return this;
    }
    /**
     * Build full context from required context
     *
     * Merges defaults → provided → required in that order
     *
     * @param requiredCtx - Required context provided by caller
     * @returns Full AIContext with all fields populated
     */
    async buildContext(requiredCtx) {
        const { defaultContext, providedContext } = this.config;
        const ctx = {
            ...defaultContext,
            ...(await providedContext?.({
                ...defaultContext,
                ...requiredCtx,
            })),
            ...requiredCtx,
            ai: this,
        };
        return ctx;
    }
    /**
     * Build core context with executor and streamer injected from ChatAPI
     *
     * This is used by Prompts to get stream/execute functions in the context.
     *
     * @param requiredCtx - Required context provided by caller
     * @returns Full context with stream and execute functions
     */
    async buildCoreContext(requiredCtx) {
        const ctx = await this.buildContext(requiredCtx);
        if (ctx.executor && ctx.streamer && ctx.estimateTokens) {
            return ctx;
        }
        // Get executor and streamer from ChatAPI
        const execute = this.chat.createExecutor();
        const stream = this.chat.createStreamer();
        const estimateTokens = this.estimateMessageTokens.bind(this);
        return {
            ...ctx,
            execute,
            stream,
            estimateTokens,
        };
    }
    /**
     * Build full metadata from required metadata
     *
     * Merges defaults → provided → required in that order
     *
     * @param requiredMetadata - Required metadata provided by caller
     * @returns Full AIMetadata with all fields populated
     */
    async buildMetadata(requiredMetadata) {
        const { defaultMetadata, providedMetadata } = this.config;
        const merged = this.mergeMetadata(defaultMetadata, requiredMetadata);
        return providedMetadata
            ? this.mergeMetadata(defaultMetadata, await providedMetadata(merged), requiredMetadata)
            : merged;
    }
    /**
     * Merges multiple metadata objects into one. Some properties may be
     * merged in a special way depending on their type. The metadata objects
     * are merged in the order they are provided, with later objects
     * overriding earlier ones.
     *
     * @param metadatas
     * @returns
     */
    mergeMetadata(...metadatas) {
        const mergeArray = (a, b) => {
            return a?.length && b?.length
                ? Array.from(new Set([...a, ...b]))
                : a?.length
                    ? a
                    : b?.length
                        ? b
                        : [];
        };
        const removeArray = (a, b) => {
            if (a?.length && b?.length) {
                return a.filter(item => !b.includes(item));
            }
            else {
                return a?.length ? a : undefined;
            }
        };
        const mergeMin = (a, b) => {
            return (a !== undefined && b !== undefined)
                ? Math.min(a, b)
                : a !== undefined ? a : b;
        };
        const mergeMax = (a, b) => {
            return (a !== undefined && b !== undefined)
                ? Math.max(a, b)
                : a !== undefined ? a : b;
        };
        const mergeAverage = (a, b) => {
            return (a !== undefined && b !== undefined)
                ? (a + b) / 2
                : a !== undefined ? a : b;
        };
        const mergeBudget = (a, b) => {
            if (!a)
                return b;
            if (!b)
                return a;
            const merged = { ...a };
            for (const key in b) {
                switch (key) {
                    case 'maxCostPerRequest':
                        merged[key] = mergeMin(a[key], b[key]);
                        break;
                    case 'maxCostPerMillionTokens':
                        merged[key] = mergeMax(a[key], b[key]);
                        break;
                    default:
                        merged[key] = b[key];
                }
            }
            return merged;
        };
        const mergeWeights = (a, b) => {
            if (!a)
                return b;
            if (!b)
                return a;
            const merged = { ...a };
            for (const key in b) {
                switch (key) {
                    case 'cost':
                    case 'speed':
                    case 'accuracy':
                    case 'contextWindow':
                        merged[key] = mergeAverage(a[key], b[key]);
                        break;
                    default:
                        merged[key] = b[key];
                        break;
                }
            }
            return merged;
        };
        const mergeProviders = (a, b) => {
            if (!a)
                return b;
            if (!b)
                return a;
            const merged = { ...a };
            for (const key in b) {
                switch (key) {
                    case 'preferred':
                        merged[key] = mergeArray(a[key], b[key]);
                        break;
                    case 'excluded':
                        merged[key] = mergeArray(a[key], b[key]);
                        break;
                    default:
                        merged[key] = b[key];
                        break;
                }
            }
            merged.allow = removeArray(merged.allow, merged.deny);
            return merged;
        };
        const merged = (metadatas[0] || {});
        for (let i = 1; i < metadatas.length; i++) {
            const metadata = metadatas[i];
            for (const key in metadata) {
                if (metadata[key] === undefined) {
                    continue;
                }
                switch (key) {
                    case 'required':
                    case 'optional':
                        merged[key] = mergeArray(merged[key], metadata[key]);
                        break;
                    case 'budget':
                        merged[key] = mergeBudget(merged[key], metadata[key]);
                        break;
                    case 'weights':
                        merged[key] = mergeWeights(merged[key], metadata[key]);
                        break;
                    case 'providers':
                        merged[key] = mergeProviders(merged[key], metadata[key]);
                        break;
                    case 'minContextWindow':
                        merged[key] = mergeMax(merged[key], metadata[key]);
                        break;
                    default:
                        merged[key] = metadata[key];
                        break;
                }
            }
        }
        return merged;
    }
    /**
     * Select a model based on metadata (used by API classes)
     * @internal
     */
    selectModel(metadata) {
        return this.registry.selectModel(metadata);
    }
    /**
     * Estimate tokens for a message (used by API classes)
     *
     * @param message - Message to estimate tokens for
     * @returns
     */
    estimateMessageTokens(message) {
        if (message.tokens !== undefined) {
            return message.tokens;
        }
        let tokens = 0;
        let addText = (text) => {
            if (text) {
                tokens += Math.ceil(text.length / this.tokens.text.divisor);
            }
        };
        addText(message.role);
        addText(message.name || '');
        addText(message.refusal || '');
        addText(message.toolCallId || '');
        if (message.toolCalls?.length) {
            addText(JSON.stringify(message.toolCalls));
        }
        if (typeof message.content === 'string') {
            addText(message.content);
        }
        else if (Array.isArray(message.content)) {
            for (const content of message.content) {
                addText(content.type);
                const metrics = this.tokens[content.type || 'text'];
                if (typeof content.content === 'string') {
                    if (content.content.startsWith('data:')) {
                        // Base64 image
                        tokens += metrics.max
                            ? Math.min(metrics.max, Math.ceil(content.content.length / metrics.base64Divisor))
                            : Math.ceil(content.content.length / metrics.base64Divisor);
                    }
                    else if (content.content.startsWith('http') && content.type !== 'text') {
                        // URL - use fallback estimate
                        tokens += metrics.fallback;
                    }
                    else {
                        addText(content.content);
                    }
                }
                else if (content.content instanceof Uint8Array) {
                    // Binary data - use fallback estimate
                    tokens += Math.ceil(content.content.byteLength / metrics.divisor);
                }
                else if (content.content instanceof Blob) {
                    // Blob data
                    tokens += Math.ceil(content.content.size / metrics.divisor);
                }
                else {
                    // URL or Stream - use fallback estimate
                    tokens += metrics.fallback;
                }
            }
        }
        return tokens;
    }
    /**
     * Estimate tokens for a request (used by API classes)
     * @internal
     */
    estimateRequestTokens(request) {
        return request.messages.reduce((sum, msg) => sum + this.estimateMessageTokens(msg), 0);
    }
    /**
     * Calculate cost for a request (used by API classes)
     * @internal
     */
    calculateCost(model, usage) {
        // Apply overrides if they match
        let pricing = model.pricing;
        if (this.config.modelOverrides) {
            for (const override of this.config.modelOverrides) {
                if (this.matchesOverride(model, override)) {
                    pricing = { ...pricing, ...override.overrides.pricing };
                }
            }
        }
        let cost = 0;
        if (usage.inputTokens && model.pricing.text?.input) {
            const inputCost = (usage.inputTokens * model.pricing.text.input) / 1_000_000;
            cost += inputCost;
        }
        if (usage.outputTokens && model.pricing.text?.output) {
            const outputCost = (usage.outputTokens * model.pricing.text.output) / 1_000_000;
            cost += outputCost;
        }
        if (usage.cachedTokens && model.pricing.text?.cached) {
            const cachedCost = (usage.cachedTokens * model.pricing.text?.cached) / 1_000_000;
            cost += cachedCost;
        }
        if (usage.reasoningTokens && model.pricing.reasoning?.output) {
            const reasoningCost = (usage.reasoningTokens * model.pricing.reasoning.output) / 1_000_000;
            cost += reasoningCost;
        }
        if (usage.seconds && model.pricing.audio?.perSecond) {
            const timeCost = usage.seconds * model.pricing.audio.perSecond;
            cost += timeCost;
        }
        if (model.pricing.perRequest) {
            cost += model.pricing.perRequest;
        }
        // TODO non text input & output tokens
        return cost;
    }
    /**
     * Determines whether a given override matches a model.
     *
     * @param model - Model information
     * @param override - Model override to check
     * @returns
     */
    matchesOverride(model, override) {
        // Provider match
        if (override.provider && override.provider !== model.provider) {
            return false;
        }
        // Exact model ID match
        if (override.modelId && override.modelId !== model.id) {
            return false;
        }
        // Pattern match
        if (override.modelPattern && !override.modelPattern.test(model.id)) {
            return false;
        }
        return true;
    }
    /**
     * Run a component with AI instance context.
     *
     * @param component - Component to run
     * @param input - Input for the component
     * @param ctx - Optional context
     */
    async run(component, input, ...[ctx]) {
        const coreContext = await this.buildCoreContext(ctx || {});
        if (component instanceof Prompt) {
            coreContext.metadata = this.mergeMetadata(component.input.metadata, coreContext.metadata);
        }
        return await component.run(input, coreContext);
    }
    /**
     * Create an enhanced prompt bound to this AI instance.
     *
     * @template TName - Name of the prompt.
     * @template TInput - Input type for the prompt.
     * @template TOutput - Output type for the prompt.
     * @template TTools - Tools used by the prompt.
     * @param options - Prompt configuration options.
     * @returns - An enhanced prompt instance.
     */
    prompt(options) {
        const { input, schema, config, reconfig, retool, validate, applicable, metadataFn, ...rest } = options;
        const hydrateFn = (optionWithInjection, getOptionWithoutInjection) => {
            return typeof optionWithInjection === 'function'
                ? getOptionWithoutInjection(resolveFn(optionWithInjection))
                : optionWithInjection;
        };
        const getContext = (ctxPartial) => {
            return this.buildContext(ctxPartial);
        };
        const prompt = new Prompt({
            ...rest,
            input: hydrateFn(input, (r) => (async (input, ctxPartial) => {
                return r(input, await getContext(ctxPartial));
            })),
            schema: hydrateFn(schema, (r) => (async (input, ctxPartial) => {
                return r(input, await getContext(ctxPartial));
            })),
            config: hydrateFn(config, (r) => (async (input, ctxPartial) => {
                return r(input, await getContext(ctxPartial));
            })),
            reconfig: hydrateFn(reconfig, (r) => (async (newConfig, ctxPartial) => {
                return r(newConfig, await getContext(ctxPartial));
            })),
            retool: hydrateFn(retool, (r) => (async (newTools, ctxPartial) => {
                return r(newTools, await getContext(ctxPartial));
            })),
            metadataFn: hydrateFn(metadataFn, (r) => (async (input, ctxPartial) => {
                return r(input, await getContext(ctxPartial));
            })),
            validate: hydrateFn(validate, (r) => (async (output, ctxPartial) => {
                return r(output, await getContext(ctxPartial));
            })),
            applicable: hydrateFn(applicable, (r) => (async (ctxPartial) => {
                return r(await getContext(ctxPartial));
            })),
        });
        // Wrap the prompt's stream method to inject executor/streamer via buildCoreContext
        const ai = this;
        // @ts-ignore
        const originalStream = prompt.stream.bind(prompt);
        prompt.stream = async function* (input, preferStream, toolsOnly, 
        // @ts-ignore
        events, ctxRequired) {
            // Build core context with executor/streamer
            const coreContext = await ai.buildCoreContext(ctxRequired);
            coreContext.metadata = ai.mergeMetadata(prompt.input.metadata, coreContext.metadata);
            const stream = originalStream(input, preferStream, toolsOnly, events, coreContext);
            let result = await stream.next();
            while (!result.done) {
                yield result.value;
                result = await stream.next();
            }
            return result.value;
        };
        this.components.push(prompt);
        return prompt;
    }
    /**
     * Create an enhanced tool bound to this AI instance
     */
    tool(options) {
        const { input, schema, call, validate, applicable, ...rest } = options;
        const hydrateFn = (optionWithInjection, getOptionWithoutInjection) => {
            return typeof optionWithInjection === 'function'
                ? getOptionWithoutInjection(resolveFn(optionWithInjection))
                : optionWithInjection;
        };
        const getContext = (ctxPartial) => {
            return this.buildContext(ctxPartial);
        };
        const tool = new Tool({
            ...rest,
            instructionsFn: hydrateFn(rest.instructionsFn, (r) => (async (ctxPartial) => {
                return r(await getContext(ctxPartial));
            })),
            descriptionFn: hydrateFn(rest.descriptionFn, (r) => (async (ctxPartial) => {
                return r(await getContext(ctxPartial));
            })),
            input: hydrateFn(input, (r) => (async (ctxPartial) => {
                return r(await getContext(ctxPartial));
            })),
            schema: hydrateFn(schema, (r) => (async (ctxPartial) => {
                return r(await getContext(ctxPartial));
            })),
            call: hydrateFn(call, (r) => async (params, refs, ctxPartial) => {
                return r(params, refs, await getContext(ctxPartial));
            }),
            validate: hydrateFn(validate, (r) => (async (params, ctxPartial) => {
                return r(params, await getContext(ctxPartial));
            })),
            applicable: hydrateFn(applicable, (r) => (async (ctxPartial) => {
                return r(await getContext(ctxPartial));
            })),
        });
        this.components.push(tool);
        return tool;
    }
    /**
     * Create an enhanced agent bound to this AI instance
     */
    agent(options) {
        const { call, applicable, ...rest } = options;
        const hydrateFn = (optionWithInjection, getOptionWithoutInjection) => {
            return typeof optionWithInjection === 'function'
                ? getOptionWithoutInjection(resolveFn(optionWithInjection))
                : optionWithInjection;
        };
        const getContext = (ctxPartial) => {
            return this.buildContext(ctxPartial);
        };
        const agent = new Agent({
            ...rest,
            call: hydrateFn(call, (r) => (async (input, refs, ctxPartial) => {
                return r(input, refs, await getContext(ctxPartial));
            })),
            applicable: hydrateFn(applicable, (r) => (async (ctxPartial) => {
                return r(await getContext(ctxPartial));
            })),
        });
        this.components.push(agent);
        return agent;
    }
    /**
     * Extend this AI instance with additional context type
     *
     * Creates a new AI instance that shares the base model registry but can have
     * its own models, overrides, handlers, and extended context type.
     *
     * @example
     * ```typescript
     * const chatAI = ai.extend<{ chat: Chat, chatMessage: ChatMessage }>({
     *   defaultContext: { chat, chatMessage },
     *   modelOverrides: [...]
     * });
     * const chatAgent = chatAI.agent({...});
     * ```
     */
    extend(config) {
        return new AI({
            // Base config
            ...this.config,
            // Override with new options
            ...config,
            // Merge objects additively
            defaultContext: {
                ...this.config.defaultContext,
                ...config?.defaultContext,
            },
            defaultMetadata: this.mergeMetadata(this.config.defaultMetadata, config?.defaultMetadata),
            providers: {
                ...this.config.providers,
                ...config?.providers,
            },
            // Merge arrays additively
            models: [
                ...(this.config.models || []),
                ...(config?.models || []),
            ],
            modelOverrides: [
                ...(this.config.modelOverrides || []),
                ...(config?.modelOverrides || []),
            ],
            modelHandlers: [
                ...(this.config.modelHandlers || []),
                ...(config?.modelHandlers || []),
            ],
            // Token estimation numbers
            tokens: {
                ...this.config.tokens,
                ...config?.tokens,
            },
            // Default scoring weights
            defaultWeights: {
                ...this.config.defaultWeights,
                ...config?.defaultWeights,
            },
            // Weight profiles: merge
            weightProfiles: {
                ...this.config.weightProfiles,
                ...config?.weightProfiles,
            },
        });
    }
    /**
     * Track a request's cost and latency for statistics.
     * Called internally by API classes after successful requests.
     *
     * @param cost - Cost of the request in dollars
     * @param latency - Latency of the request in milliseconds
     * @internal
     */
    trackRequest(cost, latency) {
        this.cumulativeCost += cost;
        this.cumulativeLatency += latency;
        this.cumulativeRequestCount += 1;
    }
    /**
     * Get library statistics
     */
    stats() {
        const models = this.registry.listModels();
        const modelsByProvider = {};
        for (const model of models) {
            modelsByProvider[model.provider] = (modelsByProvider[model.provider] || 0) + 1;
        }
        // Calculate aggregate metrics
        let totalRequests = 0;
        let successfulRequests = 0;
        let failedRequests = 0;
        for (const model of models) {
            if (model.metrics) {
                totalRequests += model.metrics.requestCount || 0;
                successfulRequests += model.metrics.successCount || 0;
                failedRequests += model.metrics.failureCount || 0;
            }
        }
        return {
            totalModels: models.length,
            modelsByProvider,
            totalRequests,
            successfulRequests,
            failedRequests,
            averageCost: this.cumulativeRequestCount > 0 ? this.cumulativeCost / this.cumulativeRequestCount : 0,
            averageLatency: this.cumulativeRequestCount > 0 ? this.cumulativeLatency / this.cumulativeRequestCount : 0,
        };
    }
}
//# sourceMappingURL=ai.js.map