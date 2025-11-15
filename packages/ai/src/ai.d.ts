/**
 * AI Class - Main Entry Point
 *
 * Instance-based AI library similar to OpenAI's SDK.
 * Provides type-safe, scoped access to AI capabilities with hooks and context injection.
 */
import { Agent, Extend, MessageContentType, Prompt, Tool, ToolCompatible, Tuple } from '@aits/core';
import { ChatAPI } from './apis/chat';
import { EmbedAPI } from './apis/embed';
import { ImageAPI } from './apis/image';
import { ModelsAPI } from './apis/models';
import { SpeechAPI } from './apis/speech';
import { TranscribeAPI } from './apis/transcribe';
import { ModelRegistry } from './registry';
import type { AgentInput, AIBaseMetadata, AIBaseTypes, AIConfig, AIConfigOf, AIContext, AIContextOptional, AIContextRequired, AIContextUser, AIHooks, AIMetadata, AIMetadataRequired, AIMetadataUser, AIProviderNames, AIProviders, AITypesInfer, ComponentFor, ComponentInput, ComponentOutput, Context, LibraryStats, Message, ModelInfo, ModelOverride, PromptInput, Providers, Request, SelectedModelFor, ToolInput, Usage } from './types';
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
export declare class AI<T extends AIBaseTypes> {
    readonly config: AIConfigOf<T>;
    readonly registry: ModelRegistry<AIProviders<T>>;
    readonly chat: ChatAPI<T>;
    readonly image: ImageAPI<T>;
    readonly speech: SpeechAPI<T>;
    readonly transcribe: TranscribeAPI<T>;
    readonly embed: EmbedAPI<T>;
    readonly models: ModelsAPI<AIProviders<T>>;
    readonly providers: AIProviders<T>;
    readonly components: ComponentFor<T>[];
    hooks: AIHooks<T>;
    private cumulativeCost;
    private cumulativeLatency;
    private cumulativeRequestCount;
    readonly tokens: Record<MessageContentType, {
        divisor: number;
        base64Divisor: number;
        fallback: number;
        max?: number;
    }>;
    /**
     * Static builder for creating AI instances with type inference
     */
    static with<TContext extends AIContextUser = {}, TMetadata extends AIMetadataUser = {}>(): {
        providers: <TProviders extends Providers>(providers: TProviders) => {
            create: <TConfig extends Omit<AIConfig<TContext, TMetadata, TProviders>, "providers">>(config: TConfig) => AI<AITypesInfer<TContext, TMetadata, TProviders, TConfig>>;
        };
    };
    constructor(config: AIConfigOf<T>);
    /**
     * Sets the hooks for this AI instance and returns the instance.
     *
     * @param hooks - Hooks to set
     * @returns this
     */
    withHooks(hooks: AIHooks<T>): this;
    /**
     * Build full context from required context
     *
     * Merges defaults → provided → required in that order
     *
     * @param requiredCtx - Required context provided by caller
     * @returns Full AIContext with all fields populated
     */
    buildContext(requiredCtx: AIContextRequired<T>): Promise<AIContext<T>>;
    /**
     * Build core context with executor and streamer injected from ChatAPI
     *
     * This is used by Prompts to get stream/execute functions in the context.
     *
     * @param requiredCtx - Required context provided by caller
     * @returns Full context with stream and execute functions
     */
    buildCoreContext(requiredCtx: AIContextRequired<T>): Promise<Context<T>>;
    /**
     * Build full metadata from required metadata
     *
     * Merges defaults → provided → required in that order
     *
     * @param requiredMetadata - Required metadata provided by caller
     * @returns Full AIMetadata with all fields populated
     */
    buildMetadata(requiredMetadata: AIMetadataRequired<T>): Promise<AIMetadata<T>>;
    /**
     * Merges multiple metadata objects into one. Some properties may be
     * merged in a special way depending on their type. The metadata objects
     * are merged in the order they are provided, with later objects
     * overriding earlier ones.
     *
     * @param metadatas
     * @returns
     */
    mergeMetadata(...metadatas: Array<Partial<AIMetadata<T> | undefined>>): AIMetadata<T>;
    /**
     * Select a model based on metadata (used by API classes)
     * @internal
     */
    selectModel(metadata: AIMetadata<T>): SelectedModelFor<T> | undefined;
    /**
     * Estimate tokens for a message (used by API classes)
     *
     * @param message - Message to estimate tokens for
     * @returns
     */
    estimateMessageTokens(message: Message): number;
    /**
     * Estimate tokens for a request (used by API classes)
     * @internal
     */
    estimateRequestTokens(request: Request): number;
    /**
     * Calculate cost for a request (used by API classes)
     * @internal
     */
    calculateCost(model: ModelInfo<AIProviderNames<T>>, usage: Usage): number;
    /**
     * Determines whether a given override matches a model.
     *
     * @param model - Model information
     * @param override - Model override to check
     * @returns
     */
    matchesOverride(model: ModelInfo, override: ModelOverride): boolean;
    /**
     * Run a component with AI instance context.
     *
     * @param component - Component to run
     * @param input - Input for the component
     * @param ctx - Optional context
     */
    run<C extends ComponentFor<T>>(component: C, input: ComponentInput<C>, ...[ctx]: AIContextOptional<T>): Promise<ComponentOutput<C>>;
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
    prompt<TName extends string = string, TInput extends object = {}, TOutput extends object | string = string, TTools extends Tuple<ToolCompatible<AIContextRequired<T>, AIMetadataRequired<T>>> = []>(options: Omit<PromptInput<AIContext<T>, AIMetadata<T>, TName, TInput, TOutput, TTools>, 'types'>): Prompt<Partial<Omit<import("./types").AIBaseContext<T>, "ai">> & Omit<import("./types").Relax<T["Context"], T["DefaultContext"] & T["ProvidedContext"]>, keyof import("./types").AIBaseContext<AIBaseTypes>> extends infer T_1 ? { [K in keyof T_1]: T_1[K]; } : never, AIBaseMetadata<AIProviders<T>> & Omit<import("./types").Relax<T["Metadata"], T["DefaultMetadata"] & T["ProvidedMetadata"]>, keyof import("./types").AIMetadataAny> extends infer T_2 ? { [K_1 in keyof T_2]: T_2[K_1]; } : never, TName, TInput, TOutput, TTools>;
    /**
     * Create an enhanced tool bound to this AI instance
     */
    tool<TName extends string = string, TParams extends object = {}, TOutput = unknown, TRefs extends Tuple<ComponentFor<T>> = []>(options: Omit<ToolInput<AIContext<T>, AIMetadata<T>, TName, TParams, TOutput, TRefs>, 'types'>): Tool<Partial<Omit<import("./types").AIBaseContext<T>, "ai">> & Omit<import("./types").Relax<T["Context"], T["DefaultContext"] & T["ProvidedContext"]>, keyof import("./types").AIBaseContext<AIBaseTypes>> extends infer T_1 ? { [K in keyof T_1]: T_1[K]; } : never, AIBaseMetadata<AIProviders<T>> & Omit<import("./types").Relax<T["Metadata"], T["DefaultMetadata"] & T["ProvidedMetadata"]>, keyof import("./types").AIMetadataAny> extends infer T_2 ? { [K_1 in keyof T_2]: T_2[K_1]; } : never, TName, TParams, Promise<TOutput>, TRefs>;
    /**
     * Create an enhanced agent bound to this AI instance
     */
    agent<TName extends string = string, TInput extends object = {}, TOutput = unknown, TRefs extends Tuple<ComponentFor<T>> = []>(options: Omit<AgentInput<AIContext<T>, AIMetadata<T>, TName, TInput, TOutput, TRefs>, 'types'>): Agent<Partial<Omit<import("./types").AIBaseContext<T>, "ai">> & Omit<import("./types").Relax<T["Context"], T["DefaultContext"] & T["ProvidedContext"]>, keyof import("./types").AIBaseContext<AIBaseTypes>> extends infer T_1 ? { [K in keyof T_1]: T_1[K]; } : never, AIBaseMetadata<AIProviders<T>> & Omit<import("./types").Relax<T["Metadata"], T["DefaultMetadata"] & T["ProvidedMetadata"]>, keyof import("./types").AIMetadataAny> extends infer T_2 ? { [K_1 in keyof T_2]: T_2[K_1]; } : never, TName, TInput, Promise<TOutput>, TRefs>;
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
    extend<TExtendedContext extends object = {}, TExtendedMetadata extends object = {}>(config?: Partial<AIConfig<Extend<T['Context'], TExtendedContext>, Extend<T['Metadata'], TExtendedMetadata>, AIProviders<T>>>): AI<AITypesInfer<Extend<T["Context"], TExtendedContext>, Extend<T["Metadata"], TExtendedMetadata>, AIProviders<T>, Partial<AIConfig<Extend<T["Context"], TExtendedContext>, Extend<T["Metadata"], TExtendedMetadata>, AIProviders<T>>>>>;
    /**
     * Track a request's cost and latency for statistics.
     * Called internally by API classes after successful requests.
     *
     * @param cost - Cost of the request in dollars
     * @param latency - Latency of the request in milliseconds
     * @internal
     */
    trackRequest(cost: number, latency: number): void;
    /**
     * Get library statistics
     */
    stats(): LibraryStats;
}
//# sourceMappingURL=ai.d.ts.map