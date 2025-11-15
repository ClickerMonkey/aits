/**
 * AI Library Types (Instance-Based API)
 *
 * Type definitions for the class-based AI library.
 * Reuses core types from @server/ai/core for consistency.
 */
import { ReadStream } from 'fs';
import type { Context as CoreContext, Request, Response, Chunk, Usage, Executor, Streamer, Message, Component, AnyComponent, ComponentInput, ComponentOutput, OptionalParams, ComponentCompatible, BaseResponse, BaseChunk, BaseRequest, ModelInput, Model, Simplify } from '@aits/core';
import type { PromptInput } from '@aits/core';
import type { ToolInput } from '@aits/core';
import type { AgentInput } from '@aits/core';
import { AI } from './ai';
export type { CoreContext, Request, Response, Chunk, Usage, Executor, Streamer, Message, Component, AnyComponent, ComponentInput, ComponentOutput, PromptInput, ToolInput, AgentInput, OptionalParams, };
/**
 * Strict partial type - explicitly marks that a type should have partial properties.
 * Used throughout the library to indicate when context/metadata can be partially provided.
 */
export type StrictPartial<T> = Partial<T>;
/**
 * Relaxes required properties of T that are present in U, making them optional.
 * This is used to compute which context/metadata fields must be provided by the caller,
 * after accounting for fields satisfied by default or provided context.
 *
 * @template T - The full type with required properties
 * @template U - The partial type with properties that can be omitted
 */
export type Relax<T, U extends Partial<T>> = Omit<T, keyof U> & Partial<Pick<T, keyof U & keyof T>>;
/**
 * Collection of AI providers mapped by name.
 * Each provider implements the Provider interface and can have its own configuration.
 */
export type Providers = Record<string, Provider<any>>;
/**
 * Capabilities that AI models can support.
 * Used for model selection to ensure the chosen model supports required features.
 *
 * - chat: Basic text completion
 * - tools: Function/tool calling
 * - vision: Image understanding
 * - json: JSON output mode
 * - structured: Structured output with schemas
 * - streaming: Streaming responses
 * - reasoning: Extended reasoning (like OpenAI o1)
 * - image: Image generation
 * - audio: Text-to-speech
 * - hearing: Speech-to-text
 * - embedding: Text embeddings
 * - zdr: Zero data retention
 */
export type ModelCapability = 'chat' | 'tools' | 'vision' | 'json' | 'structured' | 'streaming' | 'reasoning' | 'image' | 'audio' | 'hearing' | 'embedding' | 'zdr';
/**
 * Model performance and quality tiers.
 * Used for categorizing models by their capabilities and cost.
 *
 * - flagship: Top-tier models with best performance
 * - efficient: Smaller, faster, more cost-effective models
 * - legacy: Older models, may be deprecated
 * - experimental: Preview/beta models
 */
export type ModelTier = 'flagship' | 'efficient' | 'legacy' | 'experimental';
/**
 * Pricing information for a model.
 * All costs are specified per 1 million tokens unless otherwise noted.
 */
export interface ModelPricing {
    text?: {
        input?: number;
        output?: number;
        cached?: number;
    };
    audio?: {
        input?: number;
        output?: number;
        perSecond?: number;
    };
    image?: {
        input?: number;
        output?: {
            quality: string;
            sizes: {
                width: number;
                height: number;
                cost: number;
            }[];
        }[];
    };
    reasoning?: {
        input?: number;
        output?: number;
        cached?: number;
    };
    embeddings?: {
        cost?: number;
    };
    perRequest?: number;
}
/**
 * Performance and usage metrics for a model.
 * Tracked over time to inform model selection decisions.
 */
export interface ModelMetrics {
    tokensPerSecond?: number;
    timeToFirstToken?: number;
    averageRequestDuration?: number;
    accuracyScore?: number;
    requestCount?: number;
    successCount?: number;
    failureCount?: number;
    lastUpdated?: Date;
}
/**
 * Complete information about an AI model.
 * Contains capabilities, pricing, performance metrics, and metadata.
 *
 * @template TProvider - Provider name type (string union)
 */
export interface ModelInfo<TProvider extends string = string> extends Model {
    id: string;
    provider: TProvider;
    name: string;
    capabilities: Set<ModelCapability>;
    tier: ModelTier;
    pricing: ModelPricing;
    contextWindow: number;
    maxOutputTokens?: number;
    metrics?: ModelMetrics;
    tokenizer?: ModelTokenizer;
    supportedParameters?: Set<ModelParameter>;
    metadata?: Record<string, unknown>;
}
/**
 * Tokenizer type used by the model.
 */
export type ModelTokenizer = 'Other' | 'GPT' | 'Mistral' | 'Llama3' | 'Qwen3' | 'Qwen' | 'Gemini' | 'DeepSeek' | 'Claude' | 'Grok' | 'Llama4' | 'Llama2' | 'Cohere' | 'Nova' | 'Router';
/**
 * Parameter names supported by models.
 */
export type ModelParameter = 'maxTokens' | 'temperature' | 'topP' | 'frequencyPenalty' | 'presencePenalty' | 'stop' | 'seed' | 'responseFormat' | 'structuredOutput' | 'tools' | 'toolChoice' | 'logitBias' | 'logProbabilities' | 'reason' | 'imageBackground' | 'imageMultiple' | 'imageFormat' | 'imageStream' | 'imageStyle' | 'embeddingDimensions' | 'transcribeStream' | 'transcribePrompt' | 'speechInstructions';
/**
 * Override configuration for model properties.
 * Allows customizing model information without modifying the provider implementation.
 *
 * @template TProvider - Provider name type (string union)
 */
export interface ModelOverride<TProvider extends string = string> {
    provider?: TProvider;
    modelId?: string;
    modelPattern?: RegExp;
    overrides: Partial<Omit<ModelInfo<TProvider>, 'id' | 'provider'>>;
}
/**
 * Weights for scoring models during selection.
 * Higher weights prioritize that factor more heavily. Should sum to 1.0 for balanced scoring.
 */
export interface ModelSelectionWeights {
    cost?: number;
    speed?: number;
    accuracy?: number;
    contextWindow?: number;
}
/**
 * Model evaluation result from search/scoring.
 * Includes score and details about capability matching.
 *
 * @template TProvider - Provider name type
 */
export interface ScoredModel<TProvider extends string = string> {
    model: ModelInfo<TProvider>;
    score: number;
    matchedRequired: ModelCapability[];
    matchedOptional: ModelCapability[];
    missingRequired: ModelCapability[];
}
/**
 * Selected model with provider instance and configuration.
 * The result of model selection, ready to execute requests.
 *
 * @template TProviders - All available providers
 * @template TProviderName - Specific selected provider name
 */
export interface SelectedModel<TProviders extends Providers = Providers, TProviderName extends keyof TProviders = keyof TProviders> {
    model: ModelInfo<TProviderName & string>;
    provider: TProviders[TProviderName];
    providerConfig?: TProviders[TProviderName]['config'];
    score: number;
}
export type SelectedModelFor<T extends AIBaseTypes> = SelectedModel<AIProviders<T>, AIProviderNames<T>>;
/**
 * Container for all type information about an AI instance
 * This is the single type parameter used throughout
 */
export type AIBaseTypes = AITypes<any, any, any, any, any, any, Providers>;
/**
 * Concrete instance of AIBaseTypes with specific types
 */
export type AITypes<TContext extends AIContextUser, TDefaultContext extends StrictPartial<TContext>, TProvidedContext extends StrictPartial<TContext>, TMetadata extends AIMetadataUser, TDefaultMetadata extends StrictPartial<TMetadata>, TProvidedMetadata extends StrictPartial<TMetadata>, TProviders extends Providers> = {
    Context: TContext;
    DefaultContext: TDefaultContext;
    ProvidedContext: TProvidedContext;
    Metadata: TMetadata;
    DefaultMetadata: TDefaultMetadata;
    ProvidedMetadata: TProvidedMetadata;
    Providers: TProviders;
};
/**
 * Infer AIBaseTypes from AIConfig
 */
export type AITypesInfer<TContext extends object, TMetadata extends object, TProviders extends Providers, TConfig extends Omit<AIConfig<TContext, TMetadata, TProviders>, 'providers'>> = AITypes<TContext, TConfig['defaultContext'] extends (infer DC extends StrictPartial<TContext>) ? DC : {}, TConfig['providedContext'] extends (ctx: StrictPartial<TContext>) => Promise<infer PC extends StrictPartial<TContext>> ? PC : {}, TMetadata, TConfig['defaultMetadata'] extends (infer DM extends StrictPartial<TMetadata>) ? DM : {}, TConfig['providedMetadata'] extends (metadata: any) => Promise<infer PM extends StrictPartial<TMetadata>> ? PM : {}, TProviders>;
/**
 * Extract provider names as string union
 */
export type AIProviderNames<T extends AIBaseTypes> = keyof AIProviders<T> & string;
/**
 * Base metadata that all AI operations need.
 * Provides model selection criteria and constraints.
 *
 * @template TProviders - Provider types for type-safe provider filtering
 */
export interface AIBaseMetadata<TProviders extends Providers> {
    model?: ModelInput;
    required?: ModelCapability[];
    optional?: ModelCapability[];
    requiredParameters?: ModelParameter[];
    optionalParameters?: ModelParameter[];
    providers?: {
        allow?: (keyof TProviders)[];
        deny?: (keyof TProviders)[];
    };
    budget?: {
        maxCostPerRequest?: number;
        maxCostPerMillionTokens?: number;
    };
    weights?: ModelSelectionWeights;
    weightProfile?: string;
    minContextWindow?: number;
    tier?: ModelTier;
}
/**
 * Base metadata with any types - for providers & handlers.
 */
export type AIMetadataAny = AIBaseMetadata<Providers>;
/**
 * The type of user context that can be provided by the caller.
 */
export type AIMetadataUser = {
    [P in PropertyKey]: P extends keyof AIMetadataAny ? never : any;
};
/**
 * Base context that all AI operations get
 */
export type AIBaseContext<T extends AIBaseTypes> = {
    ai: AI<T>;
    metadata?: AIMetadata<T>;
    signal?: AbortSignal;
};
/**
 * Base context with any types - for providers & handlers.
 */
export type AIContextAny = Partial<AIBaseContext<AIBaseTypes>>;
/**
 * The type of user context that can be provided by the caller.
 */
export type AIContextUser = {
    [P in PropertyKey]?: P extends keyof AIContextAny ? never : any;
};
/**
 * Full context = base context + user context
 */
export type AIContext<T extends AIBaseTypes> = Simplify<AIBaseContext<T> & Omit<T['Context'], keyof AIContextAny>>;
/**
 * Infers the context type from an AI instance
 */
export type AIContextInfer<A> = A extends AI<infer T> ? AIContext<T> : never;
/**
 * Full context for given user/context/provider types
 */
export type AIContextFor<TContext extends AIContextUser, TMetadata extends AIMetadataUser, TProviders extends Providers> = AIContext<AITypesInfer<TContext, TMetadata, TProviders, AIConfig<TContext, TMetadata, TProviders>>> & AIContextAny;
/**
 * Required context that must be provided by caller
 * This relaxes properties that are satisfied by defaults or providers
 */
export type AIContextRequired<T extends AIBaseTypes> = Simplify<Partial<Omit<AIBaseContext<T>, 'ai'>> & Omit<Relax<T['Context'], T['DefaultContext'] & T['ProvidedContext']>, keyof AIContextAny>>;
/**
 * Optional context parameter type for method signatures
 */
export type AIContextOptional<T extends AIBaseTypes> = OptionalParams<[AIContextRequired<T>]>;
/**
 * Full metadata = base metadata + user metadata
 */
export type AIMetadata<T extends AIBaseTypes> = Simplify<AIBaseMetadata<AIProviders<T>> & Omit<T['Metadata'], keyof AIMetadataAny>>;
/**
 * Required metadata that must be provided by caller
 */
export type AIMetadataRequired<T extends AIBaseTypes> = Simplify<AIBaseMetadata<AIProviders<T>> & Omit<Relax<T['Metadata'], T['DefaultMetadata'] & T['ProvidedMetadata']>, keyof AIMetadataAny>>;
/**
 * Extract providers from AI types
 */
export type AIProviders<T extends AIBaseTypes> = T['Providers'];
/**
 * Extract provider type union from AI types
 */
export type AIProvider<T extends AIBaseTypes> = T['Providers'][keyof T['Providers']];
/**
 * Context passed to components (includes core context fields)
 */
export type Context<T extends AIBaseTypes> = CoreContext<AIContext<T>, AIMetadata<T>>;
/**
 * Infers the component context type from an AI instance
 */
export type ContextInfer<A> = A extends AI<infer T> ? Context<T> : never;
/**
 * Component type for AI instance
 */
export type ComponentFor<T extends AIBaseTypes> = ComponentCompatible<AIContextRequired<T>, AIMetadataRequired<T>>;
/**
 * Request for generating images from text prompts.
 */
export interface ImageGenerationRequest extends BaseRequest {
    prompt: string;
    n?: number;
    size?: string;
    quality?: 'low' | 'medium' | 'high';
    style?: 'vivid' | 'natural';
    responseFormat?: 'url' | 'b64_json';
    background?: 'transparent' | 'opaque' | 'auto';
    streamCount?: number;
    seed?: number;
    userIdentifier?: string;
}
/**
 * Request for editing existing images with text prompts.
 */
export interface ImageEditRequest extends BaseRequest {
    prompt: string;
    image: Buffer | Uint8Array | string;
    mask?: Buffer | Uint8Array | string;
    n?: number;
    size?: string;
    responseFormat?: 'url' | 'b64_json';
    seed?: number;
    streamCount?: number;
    userIdentifier?: string;
}
/**
 * Response from image generation/editing operations.
 */
export interface ImageGenerationResponse extends BaseResponse {
    images: Array<{
        url?: string;
        b64_json?: string;
        revisedPrompt?: string;
    }>;
}
/**
 * Streaming chunk for image generation progress.
 */
export interface ImageGenerationChunk extends BaseChunk {
    imageData?: string;
    progress?: number;
    done?: boolean;
    image?: {
        url?: string;
        b64_json?: string;
    };
}
/**
 * Request for transcribing audio to text.
 */
export interface TranscriptionRequest extends BaseRequest {
    audio: Buffer | ReadStream | string | File;
    language?: string;
    prompt?: string;
    temperature?: number;
    responseFormat?: 'json' | 'text' | 'srt' | 'vtt' | 'verbose_json';
    timestampGranularities?: Array<'word' | 'segment'>;
}
/**
 * Response from audio transcription.
 */
export interface TranscriptionResponse extends BaseResponse {
    text: string;
}
/**
 * Streaming chunk for transcription progress.
 */
export interface TranscriptionChunk extends BaseChunk {
    delta?: string;
    text?: string;
    segment?: {
        start: number;
        end: number;
        speaker: string;
        text: string;
        id: string;
    };
    status?: string;
}
/**
 * Request for generating speech from text.
 */
export interface SpeechRequest extends BaseRequest {
    text: string;
    instructions?: string;
    voice?: string;
    speed?: number;
    responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
}
/**
 * Response from speech synthesis.
 */
export interface SpeechResponse extends BaseResponse {
    audio: ReadableStream<any>;
    responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
}
/**
 * Request for generating text embeddings.
 */
export interface EmbeddingRequest extends BaseRequest {
    texts: string[];
    dimensions?: number;
    encodingFormat?: 'float' | 'base64';
    userIdentifier?: string;
}
/**
 * Response from embedding generation.
 */
export interface EmbeddingResponse extends BaseResponse {
    embeddings: Array<{
        embedding: number[];
        index: number;
    }>;
}
/**
 * Request for analyzing images with vision models.
 */
export interface ImageAnalyzeRequest extends BaseRequest {
    prompt: string;
    images: string[];
    maxTokens?: number;
    temperature?: number;
}
/**
 * Model-specific handler that overrides default provider behavior.
 * Use handlers to provide custom implementations for specific models that differ
 * from the provider's standard API (e.g., special Replicate models).
 *
 * @template TContext - Context type passed to handler methods
 * @template TProvider - Provider name type
 *
 * @example
 * ```typescript
 * const handler: ModelHandler = {
 *   provider: 'replicate',
 *   modelId: 'stability-ai/sdxl',
 *   imageGenerate: {
 *     get: async (request, ctx) => {
 *       // Custom implementation for this specific model
 *       return customImageGeneration(request, ctx);
 *     }
 *   }
 * };
 * ```
 */
export interface ModelHandler<TContext extends AIContextAny = AIContextAny> {
    models: string[];
    chat?: {
        get?: <TRuntimeContext extends TContext>(request: Request, ctx: TRuntimeContext) => Promise<Response>;
        stream?: <TRuntimeContext extends TContext>(request: Request, ctx: TRuntimeContext) => AsyncIterable<Chunk>;
    };
    imageGenerate?: {
        get?: <TRuntimeContext extends TContext>(request: ImageGenerationRequest, ctx: TRuntimeContext) => Promise<ImageGenerationResponse>;
        stream?: <TRuntimeContext extends TContext>(request: ImageGenerationRequest, ctx: TRuntimeContext) => AsyncIterable<ImageGenerationChunk>;
    };
    imageEdit?: {
        get?: <TRuntimeContext extends TContext>(request: ImageEditRequest, ctx: TRuntimeContext) => Promise<ImageGenerationResponse>;
        stream?: <TRuntimeContext extends TContext>(request: ImageEditRequest, ctx: TRuntimeContext) => AsyncIterable<ImageGenerationChunk>;
    };
    imageAnalyze?: {
        get?: <TRuntimeContext extends TContext>(request: ImageAnalyzeRequest, ctx: TRuntimeContext) => Promise<Response>;
        streem?: <TRuntimeContext extends TContext>(request: ImageAnalyzeRequest, ctx: TRuntimeContext) => AsyncIterable<Chunk>;
    };
    transcribe?: {
        get?: <TRuntimeContext extends TContext>(request: TranscriptionRequest, ctx: TRuntimeContext) => Promise<TranscriptionResponse>;
        stream?: <TRuntimeContext extends TContext>(request: TranscriptionRequest, ctx: TRuntimeContext) => AsyncIterable<TranscriptionChunk>;
    };
    speech?: {
        get?: <TRuntimeContext extends TContext>(request: SpeechRequest, ctx: TRuntimeContext) => Promise<SpeechResponse>;
    };
    embed?: {
        get?: <TRuntimeContext extends TContext>(request: EmbeddingRequest, ctx: TRuntimeContext) => Promise<EmbeddingResponse>;
    };
}
/**
 * Model handler for AIBaseTypes instance
 */
export type ModelHandlerFor<T extends AIBaseTypes> = ModelHandler<AIContext<T>>;
/**
 * Model transformer for providers with inconsistent request/response shapes.
 * Transforms standard requests/responses to/from provider-specific formats.
 * Useful for adapting providers like Replicate that have model-specific APIs.
 *
 * @template TContext - Context type passed to transformer methods
 */
export interface ModelTransformer {
    chat?: {
        convertRequest?: (request: Request, ctx: AIContextAny) => object;
        parseResponse?: (response: object, ctx: AIContextAny) => Response;
        parseChunk?: (chunk: object, ctx: AIContextAny) => Chunk;
    };
    imageGenerate?: {
        convertRequest?: (request: ImageGenerationRequest, ctx: AIContextAny) => object;
        parseResponse?: (response: object, ctx: AIContextAny) => ImageGenerationResponse;
        parseChunk?: (chunk: object, ctx: AIContextAny) => ImageGenerationChunk;
    };
    imageEdit?: {
        convertRequest?: (request: ImageEditRequest, ctx: AIContextAny) => object;
        parseResponse?: (response: object, ctx: AIContextAny) => ImageGenerationResponse;
        parseChunk?: (chunk: object, ctx: AIContextAny) => ImageGenerationChunk;
    };
    imageAnalyze?: {
        convertRequest?: (request: ImageAnalyzeRequest, ctx: AIContextAny) => object;
        parseResponse?: (response: object, ctx: AIContextAny) => Response;
        parseChunk?: (chunk: object, ctx: AIContextAny) => Chunk;
    };
    transcribe?: {
        convertRequest?: (request: TranscriptionRequest, ctx: AIContextAny) => object;
        parseResponse?: (response: object, ctx: AIContextAny) => TranscriptionResponse;
        parseChunk?: (chunk: object, ctx: AIContextAny) => TranscriptionChunk;
    };
    speech?: {
        convertRequest?: (request: SpeechRequest, ctx: AIContextAny) => object;
        parseResponse?: (response: object, ctx: AIContextAny) => SpeechResponse;
    };
    embed?: {
        convertRequest?: (request: EmbeddingRequest, ctx: AIContextAny) => object;
        parseResponse?: (response: object, ctx: AIContextAny) => EmbeddingResponse;
    };
}
/**
 * External source of model information.
 * Model sources fetch model metadata from external registries (e.g., OpenRouter)
 * to enrich provider model information with pricing, capabilities, and metrics.
 *
 * @example
 * ```typescript
 * const openRouterSource: ModelSource = {
 *   name: 'openrouter',
 *   fetchModels: async () => {
 *     const response = await fetch('https://openrouter.ai/api/v1/models');
 *     return parseModels(response);
 *   }
 * };
 * ```
 */
export interface ModelSource {
    name: string;
    fetchModels(config?: Record<string, unknown>): Promise<ModelInfo[]>;
}
/**
 * AI provider implementation interface.
 * Providers implement the actual communication with AI services (OpenAI, Anthropic, etc.).
 * They expose methods for different capabilities (chat, images, speech, etc.).
 *
 * @template TConfig - Provider-specific configuration type
 *
 * @example
 * ```typescript
 * const openai: Provider<OpenAIConfig> = {
 *   name: 'openai',
 *   config: { apiKey: process.env.OPENAI_API_KEY },
 *
 *   async listModels() {
 *     // Fetch available models from OpenAI
 *     return [...];
 *   },
 *
 *   async checkHealth() {
 *     // Verify API is accessible
 *     return true;
 *   },
 *
 *   createExecutor() {
 *     // Return chat completion function
 *     return async (request, ctx, metadata) => {
 *       // Make API call
 *       return response;
 *     };
 *   },
 *
 *   // ... other methods
 * };
 * ```
 */
export interface Provider<TConfig = any> {
    name: string;
    config: TConfig;
    priority?: number;
    defaultMetadata?: Partial<AIBaseMetadata<any>>;
    listModels?(config?: TConfig): Promise<ModelInfo[]>;
    checkHealth(config?: TConfig): Promise<boolean>;
    createExecutor?(config?: TConfig): Executor<AIContextAny, AIMetadataAny>;
    createStreamer?(config?: TConfig): Streamer<AIContextAny, AIMetadataAny>;
    generateImage?(request: ImageGenerationRequest, ctx: AIContextAny, config?: TConfig): Promise<ImageGenerationResponse>;
    generateImageStream?(request: ImageGenerationRequest, ctx: AIContextAny, config?: TConfig): AsyncIterable<ImageGenerationChunk>;
    editImage?(request: ImageEditRequest, ctx: AIContextAny, config?: TConfig): Promise<ImageGenerationResponse>;
    editImageStream?(request: ImageEditRequest, ctx: AIContextAny, config?: TConfig): AsyncIterable<ImageGenerationChunk>;
    transcribe?(request: TranscriptionRequest, ctx: AIContextAny, config?: TConfig): Promise<TranscriptionResponse>;
    transcribeStream?(request: TranscriptionRequest, ctx: AIContextAny, config?: TConfig): AsyncIterable<TranscriptionChunk>;
    speech?(request: SpeechRequest, ctx: AIContextAny, config?: TConfig): Promise<SpeechResponse>;
    embed?(request: EmbeddingRequest, ctx: AIContextAny, config?: TConfig): Promise<EmbeddingResponse>;
    analyzeImage?(request: ImageAnalyzeRequest, ctx: AIContextAny, config?: TConfig): Promise<Response>;
    analyzeImageStream?(request: ImageAnalyzeRequest, ctx: AIContextAny, config?: TConfig): AsyncIterable<Chunk>;
}
/**
 * Lifecycle hooks for AI operations.
 * Hooks allow you to intercept and modify AI operations at key points:
 * - Model selection
 * - Before/after requests
 * - Error handling
 *
 * @template T - AIBaseTypes container
 *
 * @example
 * ```typescript
 * const hooks: AIHooks<MyAITypes> = {
 *   beforeRequest: async (ctx, selected, tokens, cost) => {
 *     console.log(`Using ${selected.model.id}, estimated ${tokens} tokens, cost ${cost}`);
 *
 *     // Check budget
 *     if (ctx.user.budget < estimatedCost) {
 *       throw new Error('Insufficient budget');
 *     }
 *   },
 *
 *   afterRequest: async (ctx, selected, usage, cost) => {
 *     // Track usage in database
 *     await db.logUsage(ctx.user.id, usage, cost);
 *   },
 *
 *   onError: (type, message, error, ctx) => {
 *     logger.error(`AI Error [${type}]: ${message}`, error);
 *   }
 * };
 * ```
 */
export interface AIHooks<T extends AIBaseTypes> {
    /**
     * Called before model selection, allows modifying metadata.
     * Use this to dynamically adjust model selection criteria based on context.
     */
    beforeModelSelection?: (ctx: AIContext<T>, request: BaseRequest, metadata: AIMetadata<T>) => Promise<AIMetadata<T>> | AIMetadata<T>;
    /**
     * Called after model selection, can override the selected model or config.
     * Return a modified SelectedModel to change the selection, or void to accept it.
     */
    onModelSelected?: (ctx: AIContext<T>, request: BaseRequest, selected: SelectedModelFor<T>) => Promise<SelectedModelFor<T> | void> | SelectedModelFor<T> | void;
    /**
     * Called before making the API request.
     * Use this for budget checks, rate limiting, or logging.
     * Throw an error to cancel the request.
     */
    beforeRequest?: (ctx: AIContext<T>, request: BaseRequest, selected: SelectedModelFor<T>, estimatedTokens: number, estimatedCost: number) => Promise<void> | void;
    /**
     * Called after successful request completion.
     * Use this to track usage, update budgets, or log metrics.
     */
    afterRequest?: (ctx: AIContext<T>, request: BaseRequest, response: BaseResponse, responseComplete: boolean, selected: SelectedModelFor<T>, usage: Usage, cost: number) => Promise<void> | void;
    /**
     * Called when an error occurs in any AI operation.
     * Use this for centralized error logging and monitoring.
     */
    onError?: (errorType: string, message: string, error?: Error, ctx?: AIContext<T> | AIContextRequired<T>, request?: BaseRequest) => void;
}
/**
 * Configuration for creating an AI instance.
 * Defines providers, context, metadata, and model management settings.
 *
 * @template TContext - Custom context type
 * @template TMetadata - Custom metadata type
 * @template TProviders - Available providers
 *
 * @example
 * ```typescript
 * const config: AIConfig<AppContext, AppMetadata, typeof providers> = {
 *   // Context management
 *   defaultContext: {
 *     apiVersion: 'v1'
 *   },
 *   providedContext: async (ctx) => ({
 *     user: await getUser(ctx.userId),
 *     db: database
 *   }),
 *
 *   // Providers
 *   providers: { openai, anthropic },
 *
 *   // Model configuration
 *   models: customModels,
 *   modelOverrides: [
 *     {
 *       modelPattern: /gpt-4/,
 *       overrides: { pricing: customPricing }
 *     }
 *   ],
 *
 *   // Model sources
 *   modelSources: [openRouterSource],
 *
 *   // Selection profiles
 *   defaultWeights: { cost: 0.6, speed: 0.4 },
 *   profiles: {
 *     costPriority: { cost: 0.9, speed: 0.1 },
 *     performance: { cost: 0.1, speed: 0.5, accuracy: 0.4 }
 *   }
 * };
 * ```
 */
export interface AIConfig<TContext extends AIContextUser, TMetadata extends AIMetadataUser, TProviders extends Providers> {
    defaultContext?: StrictPartial<TContext>;
    providedContext?: (ctx: StrictPartial<TContext>) => Promise<StrictPartial<TContext>>;
    defaultMetadata?: StrictPartial<Omit<TMetadata, keyof AIMetadataAny> & AIBaseMetadata<TProviders>>;
    providedMetadata?: (metadata: StrictPartial<Omit<TMetadata, keyof AIMetadataAny> & AIBaseMetadata<TProviders>>) => Promise<StrictPartial<TMetadata> & AIBaseMetadata<TProviders>>;
    providers: TProviders;
    models?: ModelInfo[];
    modelOverrides?: ModelOverride[];
    modelHandlers?: ModelHandler<AIContextFor<TContext, TMetadata, TProviders>>[];
    modelSources?: ModelSource[];
    defaultWeights?: ModelSelectionWeights;
    weightProfiles?: Record<string, ModelSelectionWeights>;
    tokens?: {
        textDivisor?: number;
        textBase64Divisor?: number;
        textFallback?: number;
        textMax?: number;
        imageDivisor?: number;
        imageBase64Divisor?: number;
        imageFallback?: number;
        imageMax?: number;
        fileDivisor?: number;
        fileBase64Divisor?: number;
        fileFallback?: number;
        fileMax?: number;
        audioDivisor?: number;
        audioBase64Divisor?: number;
        audioFallback?: number;
        audioMax?: number;
    };
    defaultCostPerMillionTokens?: number;
}
/**
 * Extract AIConfig type from AIBaseTypes
 */
export type AIConfigOf<T extends AIBaseTypes> = AIConfig<T['Context'], T['Metadata'], AIProviders<T>>;
/**
 * Runtime statistics about the AI instance.
 * Provides insights into model usage and performance.
 */
export interface LibraryStats {
    totalModels: number;
    modelsByProvider: Record<string, number>;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageCost: number;
    averageLatency: number;
}
//# sourceMappingURL=types.d.ts.map